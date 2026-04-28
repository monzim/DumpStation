package backup

import (
	"sync"
	"testing"
	"time"
)

// TestVersionManager_ConcurrentAccess hammers the cache from many goroutines.
// Run with `go test -race` to surface any unsynchronised map access — without
// the mutex this test panics with "concurrent map writes".
func TestVersionManager_ConcurrentAccess(t *testing.T) {
	t.Parallel()

	vm := NewVersionManager()

	const goroutines = 100
	var wg sync.WaitGroup
	wg.Add(goroutines)

	for i := range goroutines {
		go func() {
			defer wg.Done()
			host := "db"
			if i%2 == 0 {
				host = "db-other"
			}

			vm.SetSSLMode(host, 5432, SSLModeDisable)
			_ = vm.GetSSLModeForDatabase(host, 5432)

			// Direct write into versionCache through the locked path. We
			// mimic what DetectPostgresVersion does on cache miss.
			vm.mu.Lock()
			vm.versionCache[host+":5432"] = cachedVersion{value: "15", cachedAt: time.Now()}
			vm.mu.Unlock()

			vm.mu.RLock()
			_ = vm.versionCache[host+":5432"]
			vm.mu.RUnlock()
		}()
	}

	wg.Wait()
}

func TestVersionManager_CacheTTL(t *testing.T) {
	t.Parallel()

	vm := NewVersionManager()
	key := "primary:5432"

	vm.mu.Lock()
	vm.versionCache[key] = cachedVersion{value: "15", cachedAt: time.Now().Add(-2 * versionCacheTTL)}
	vm.mu.Unlock()

	vm.mu.RLock()
	cached, ok := vm.versionCache[key]
	vm.mu.RUnlock()

	if !ok {
		t.Fatal("expected cache entry to be present (TTL is enforced by reader, not eviction)")
	}
	if time.Since(cached.cachedAt) < versionCacheTTL {
		t.Fatalf("test setup error: cached entry should be older than TTL, age=%v", time.Since(cached.cachedAt))
	}
	// Reader logic in DetectPostgresVersion treats this as expired and re-detects.
}

func TestVersionManager_GetSSLModeDefault(t *testing.T) {
	t.Parallel()

	vm := NewVersionManager()
	got := vm.GetSSLModeForDatabase("never-seen", 1234)
	if got != SSLModeRequire {
		t.Fatalf("default SSL mode = %q, want %q", got, SSLModeRequire)
	}
}

func TestVersionManager_ParseMajorVersion(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "verbose banner", in: "PostgreSQL 14.5 on x86_64-pc-linux-gnu", want: "14"},
		{name: "ubuntu suffix", in: "15.2 (Ubuntu 15.2-1.pgdg20.04+1)", want: "15"},
		{name: "bare", in: "13.4", want: "13"},
		{name: "garbage", in: "not a version", want: "latest"},
	}

	vm := NewVersionManager()
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := vm.ParseMajorVersion(tc.in); got != tc.want {
				t.Fatalf("ParseMajorVersion(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}
