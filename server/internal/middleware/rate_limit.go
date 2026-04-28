package middleware

import (
	"encoding/json"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/monzim/db_proxy/v1/internal/auth"
	"golang.org/x/time/rate"
)

// authRateLimit defaults: 5 attempts per IP per minute, burst of 5.
// Tight enough to make a 6-digit OTP brute force impractical (1M attempts ÷
// 5/min ≈ 138 days) without preventing a real user from retrying after a
// typo.
const (
	authRequestsPerMinute = 5.0
	authBurst             = 5

	// idleEvictionAfter prunes a per-IP limiter that has been quiet for a
	// while so the in-memory map does not grow unbounded under abuse.
	idleEvictionAfter = 30 * time.Minute
	cleanupInterval   = 5 * time.Minute
)

type ipLimiter struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// IPRateLimiter keeps one token-bucket limiter per source IP. Safe for
// concurrent use. The first instantiation spawns a background sweeper that
// evicts idle IPs.
type IPRateLimiter struct {
	mu       sync.Mutex
	limiters map[string]*ipLimiter
	rps      rate.Limit
	burst    int
	once     sync.Once
}

// NewIPRateLimiter constructs a limiter pool. rpm is requests-per-minute.
func NewIPRateLimiter(rpm float64, burst int) *IPRateLimiter {
	return &IPRateLimiter{
		limiters: make(map[string]*ipLimiter),
		rps:      rate.Limit(rpm / 60.0),
		burst:    burst,
	}
}

func (l *IPRateLimiter) get(ip string) *rate.Limiter {
	l.mu.Lock()
	defer l.mu.Unlock()

	if entry, ok := l.limiters[ip]; ok {
		entry.lastSeen = time.Now()
		return entry.limiter
	}

	entry := &ipLimiter{
		limiter:  rate.NewLimiter(l.rps, l.burst),
		lastSeen: time.Now(),
	}
	l.limiters[ip] = entry
	return entry.limiter
}

func (l *IPRateLimiter) sweep() {
	l.once.Do(func() {
		go func() {
			ticker := time.NewTicker(cleanupInterval)
			defer ticker.Stop()
			for range ticker.C {
				cutoff := time.Now().Add(-idleEvictionAfter)
				l.mu.Lock()
				for ip, entry := range l.limiters {
					if entry.lastSeen.Before(cutoff) {
						delete(l.limiters, ip)
					}
				}
				l.mu.Unlock()
			}
		}()
	})
}

// AuthRateLimit returns middleware that throttles unauthenticated auth
// endpoints by source IP. OPTIONS preflights bypass the limiter so CORS
// stays predictable.
func AuthRateLimit() func(http.Handler) http.Handler {
	pool := NewIPRateLimiter(authRequestsPerMinute, authBurst)
	pool.sweep()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}

			ip := auth.GetIPAddress(r)
			if ip == "" {
				// Without an IP we cannot key the limiter — refuse the request
				// rather than allow unbounded traffic from an unknown source.
				writeRateLimitError(w, "unable to determine source address", 60)
				return
			}

			if !pool.get(ip).Allow() {
				writeRateLimitError(w, "too many requests, please retry later", 60)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func writeRateLimitError(w http.ResponseWriter, msg string, retryAfterSeconds int) {
	w.Header().Set("Retry-After", strconv.Itoa(retryAfterSeconds))
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusTooManyRequests)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error": msg,
		"code":  "rate_limited",
	})
}
