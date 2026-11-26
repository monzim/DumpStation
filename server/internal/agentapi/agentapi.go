// Package agentapi serves the HTTPS endpoints DumpStation Agents call.
// Every request is initiated by the agent; the server never dials out to it.
//
// Authorization model:
//   - Enrollment uses a short-lived, single-use token created in the UI.
//   - All other calls carry the agent's own credential (only its SHA-256 is
//     stored). Revoked agents are rejected; disabled agents may heartbeat
//     but receive no work.
//   - Every job operation is checked against the job's agent, tenant and
//     current lease token, so a compromised agent can only touch jobs
//     assigned to it, and a stale/duplicate delivery cannot apply twice.
//   - Storage access is limited to presigned, object-scoped URLs for keys
//     chosen by the server.
package agentapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/lib/pq"
	"github.com/monzim/db_proxy/v1/internal/agentproto"
	"github.com/monzim/db_proxy/v1/internal/jobs"
	"github.com/monzim/db_proxy/v1/internal/models"
	"github.com/monzim/db_proxy/v1/internal/repository"
	"golang.org/x/time/rate"
)

// Token prefixes make leaked credentials easy to recognise and scan for.
const (
	EnrollmentPrefix = "dse_"
	CredentialPrefix = "dsa_"
)

// HashToken returns the hex SHA-256 used to store tokens.
func HashToken(t string) string {
	sum := sha256.Sum256([]byte(t))
	return hex.EncodeToString(sum[:])
}

// NewToken returns prefix + 32 random bytes in hex.
func NewToken(prefix string) string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return prefix + hex.EncodeToString(b)
}

// API implements the agent endpoints.
type API struct {
	repo        *repository.Repository
	orch        *jobs.Orchestrator
	trustProxy  bool
	enrollLimit *ipLimiter
	agentLimit  *ipLimiter
}

// New creates the agent API.
func New(repo *repository.Repository, orch *jobs.Orchestrator, trustProxy bool) *API {
	return &API{
		repo: repo, orch: orch, trustProxy: trustProxy,
		enrollLimit: newIPLimiter(rate.Every(6*time.Second), 5),
		agentLimit:  newIPLimiter(rate.Every(50*time.Millisecond), 60),
	}
}

type ctxKey struct{}

// Register mounts the endpoints under /agent/v1.
func (a *API) Register(r *mux.Router) {
	s := r.PathPrefix("/agent/" + agentproto.Version).Subrouter()
	s.HandleFunc("/enroll", a.enroll).Methods(http.MethodPost)
	authed := s.NewRoute().Subrouter()
	authed.Use(a.authenticate)
	authed.HandleFunc("/heartbeat", a.heartbeat).Methods(http.MethodPost)
	authed.HandleFunc("/jobs/next", a.nextJob).Methods(http.MethodGet)
	authed.HandleFunc("/jobs/{id}/events", a.jobEvent).Methods(http.MethodPost)
	authed.HandleFunc("/jobs/{id}/upload/part-url", a.partURL).Methods(http.MethodPost)
	authed.HandleFunc("/jobs/{id}/artifact", a.uploadArtifact).Methods(http.MethodPut)
	authed.HandleFunc("/jobs/{id}/artifact", a.downloadArtifact).Methods(http.MethodGet)
	authed.HandleFunc("/jobs/{id}/download-url", a.downloadURL).Methods(http.MethodPost)
	authed.HandleFunc("/jobs/{id}/complete", a.complete).Methods(http.MethodPost)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, agentproto.ErrorResponse{Code: code, Message: msg})
}

func decode(r *http.Request, v any) error {
	return json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(v)
}

func (a *API) clientIP(r *http.Request) string {
	if a.trustProxy {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			return strings.TrimSpace(strings.Split(xff, ",")[0])
		}
		if xr := r.Header.Get("X-Real-IP"); xr != "" {
			return xr
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func (a *API) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := a.clientIP(r)
		if !a.agentLimit.allow(ip) {
			writeErr(w, http.StatusTooManyRequests, "rate_limited", "too many requests")
			return
		}
		h := r.Header.Get("Authorization")
		tok := strings.TrimPrefix(h, "Bearer ")
		if tok == h || !strings.HasPrefix(tok, CredentialPrefix) {
			writeErr(w, http.StatusUnauthorized, "unauthorized", "missing or malformed agent credential")
			return
		}
		agent, err := a.repo.GetAgentByTokenHash(HashToken(tok))
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "internal", "lookup failed")
			return
		}
		if agent == nil || agent.Status == models.AgentStatusRevoked {
			writeErr(w, http.StatusUnauthorized, "revoked", "agent credential is not valid; re-enroll the agent")
			return
		}
		now := time.Now()
		if agent.LastSeenAt == nil || now.Sub(*agent.LastSeenAt) > 10*time.Second || agent.LastIP != ip {
			_ = a.repo.UpdateAgentFields(agent.ID, map[string]any{"last_seen_at": now, "last_ip": ip})
			agent.LastSeenAt = &now
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, agent)))
	})
}

func agentFrom(r *http.Request) *models.Agent { return r.Context().Value(ctxKey{}).(*models.Agent) }

func infoFields(info agentproto.AgentInfo) map[string]any {
	conns := make([]models.AgentConnectionInfo, 0, len(info.Connections))
	for i, c := range info.Connections {
		if i >= 200 {
			break
		}
		conns = append(conns, models.AgentConnectionInfo{Name: trunc(c.Name, 128), Database: trunc(c.Database, 255), Host: trunc(c.Host, 255)})
	}
	maxc := info.MaxConcurrency
	if maxc < 1 {
		maxc = 1
	}
	if maxc > 16 {
		maxc = 16
	}
	f := map[string]any{
		"version":             trunc(info.Version, 64),
		"hostname":            trunc(info.Hostname, 255),
		"platform":            trunc(info.Platform, 64),
		"pg_versions":         pq.StringArray(clip(info.PgVersions, 20, 8)),
		"upload_modes":        pq.StringArray(clip(info.TransferModes, 4, 16)),
		"agent_allow_restore": info.AllowRestore,
		"max_concurrency":     maxc,
	}
	b, _ := json.Marshal(conns)
	f["connections"] = string(b)
	return f
}

func trunc(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

func clip(in []string, n, each int) []string {
	out := []string{}
	for i, s := range in {
		if i >= n {
			break
		}
		out = append(out, trunc(s, each))
	}
	return out
}

func (a *API) enroll(w http.ResponseWriter, r *http.Request) {
	ip := a.clientIP(r)
	if !a.enrollLimit.allow(ip) {
		writeErr(w, http.StatusTooManyRequests, "rate_limited", "too many enrollment attempts")
		return
	}
	var req agentproto.EnrollRequest
	if err := decode(r, &req); err != nil || !strings.HasPrefix(req.Token, EnrollmentPrefix) {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid enrollment request")
		return
	}
	cred := NewToken(CredentialPrefix)
	meta := infoFields(req.Info)
	meta["last_ip"] = ip
	meta["online_notified"] = true
	agent, err := a.repo.ConsumeEnrollment(HashToken(req.Token), HashToken(cred), cred[:12], meta)
	if errors.Is(err, repository.ErrEnrollmentInvalid) {
		writeErr(w, http.StatusUnauthorized, "invalid_token", err.Error())
		return
	}
	if err != nil {
		log.Printf("[agentapi] enroll: %v", err)
		writeErr(w, http.StatusInternalServerError, "internal", "enrollment failed")
		return
	}
	aid := agent.ID
	_ = a.repo.LogActivity(&agent.UserID, models.ActionAgentRegistered, models.LogLevelSuccess, "agent", &aid, agent.Name,
		fmt.Sprintf("Agent %q registered from %s (%s)", agent.Name, agent.Hostname, ip),
		fmt.Sprintf(`{"version":%q,"platform":%q}`, agent.Version, agent.Platform), ip)
	writeJSON(w, http.StatusOK, agentproto.EnrollResponse{AgentID: agent.ID, AgentName: agent.Name, Credential: cred})
}

func (a *API) heartbeat(w http.ResponseWriter, r *http.Request) {
	agent := agentFrom(r)
	var req agentproto.HeartbeatRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid heartbeat")
		return
	}
	f := infoFields(req.Info)
	f["running_jobs"] = len(req.RunningJobs)
	_ = a.repo.UpdateAgentFields(agent.ID, f)
	if len(req.RunningJobs) > 0 {
		_ = a.repo.ExtendLeases(agent.ID, req.RunningJobs, a.orch.Config().LeaseTTL)
	}
	writeJSON(w, http.StatusOK, agentproto.HeartbeatResponse{
		Status: string(agent.Status), CancelJobs: a.orch.CancelledJobs(agent, req.RunningJobs), ServerTime: time.Now(),
	})
}

func (a *API) nextJob(w http.ResponseWriter, r *http.Request) {
	agent := agentFrom(r)
	wait, _ := strconv.Atoi(r.URL.Query().Get("wait"))
	if wait < 0 {
		wait = 0
	}
	if wait > 30 {
		wait = 30
	}
	deadline := time.Now().Add(time.Duration(wait) * time.Second)
	sig, unsub := a.orch.Signals().Subscribe(agent.ID)
	defer unsub()
	for {
		// Re-read the agent so disable/revoke take effect mid-poll.
		cur, err := a.repo.GetAgent(agent.ID)
		if err != nil || cur == nil || cur.Status == models.AgentStatusRevoked {
			writeErr(w, http.StatusUnauthorized, "revoked", "agent revoked")
			return
		}
		job, err := a.orch.LeaseNext(cur)
		if err != nil {
			log.Printf("[agentapi] lease: %v", err)
			writeErr(w, http.StatusInternalServerError, "internal", "could not lease job")
			return
		}
		if job != nil {
			writeJSON(w, http.StatusOK, job)
			return
		}
		remaining := time.Until(deadline)
		if remaining <= 0 {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if remaining > 5*time.Second {
			remaining = 5 * time.Second // re-check for backoff-delayed jobs
		}
		select {
		case <-r.Context().Done():
			return
		case <-sig:
		case <-time.After(remaining):
		}
	}
}

func (a *API) leasedJob(w http.ResponseWriter, r *http.Request, token string) (*models.Agent, *models.AgentJob, bool) {
	agent := agentFrom(r)
	id, err := uuid.Parse(mux.Vars(r)["id"])
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid job id")
		return nil, nil, false
	}
	job, err := a.orch.CheckLease(agent, id, token)
	if errors.Is(err, jobs.ErrLeaseMismatch) {
		writeErr(w, http.StatusConflict, "lease_invalid", "lease is no longer valid; abandon this job")
		return nil, nil, false
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", "lookup failed")
		return nil, nil, false
	}
	return agent, job, true
}

func (a *API) jobEvent(w http.ResponseWriter, r *http.Request) {
	var req agentproto.EventRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid event")
		return
	}
	agent, job, ok := a.leasedJob(w, r, req.LeaseToken)
	if !ok {
		return
	}
	cancel := a.orch.RecordEvent(agent, job, req)
	writeJSON(w, http.StatusOK, agentproto.EventResponse{Cancel: cancel})
}

func (a *API) partURL(w http.ResponseWriter, r *http.Request) {
	var req agentproto.PartURLRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid request")
		return
	}
	_, job, ok := a.leasedJob(w, r, req.LeaseToken)
	if !ok {
		return
	}
	url, exp, err := a.orch.PresignPart(r.Context(), job, req.PartNumber)
	if errors.Is(err, jobs.ErrLeaseMismatch) {
		writeErr(w, http.StatusConflict, "lease_invalid", "lease is no longer valid")
		return
	}
	if err != nil {
		writeErr(w, http.StatusBadGateway, "storage_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, agentproto.URLResponse{URL: url, ExpiresAt: exp})
}

func (a *API) uploadArtifact(w http.ResponseWriter, r *http.Request) {
	_, job, ok := a.leasedJob(w, r, r.Header.Get(agentproto.HeaderLeaseToken))
	if !ok {
		return
	}
	n, sum, err := a.orch.ProxyUpload(r.Context(), job, r.Body, r.Header.Get(agentproto.HeaderSHA256))
	if err != nil {
		writeErr(w, http.StatusBadGateway, "upload_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"size_bytes": n, "sha256": sum})
}

func (a *API) downloadURL(w http.ResponseWriter, r *http.Request) {
	var req agentproto.LeaseRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid request")
		return
	}
	_, job, ok := a.leasedJob(w, r, req.LeaseToken)
	if !ok {
		return
	}
	url, exp, err := a.orch.RestoreArtifactURL(job)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "storage_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, agentproto.URLResponse{URL: url, ExpiresAt: exp})
}

func (a *API) downloadArtifact(w http.ResponseWriter, r *http.Request) {
	_, job, ok := a.leasedJob(w, r, r.Header.Get(agentproto.HeaderLeaseToken))
	if !ok {
		return
	}
	rc, size, err := a.orch.OpenRestoreArtifact(r.Context(), job)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "storage_error", err.Error())
		return
	}
	defer rc.Close()
	w.Header().Set("Content-Type", "application/octet-stream")
	if size > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	}
	_, _ = io.Copy(w, rc)
}

func (a *API) complete(w http.ResponseWriter, r *http.Request) {
	var req agentproto.CompleteRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid request")
		return
	}
	agent := agentFrom(r)
	id, err := uuid.Parse(mux.Vars(r)["id"])
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid job id")
		return
	}
	job, err := a.orch.CheckLease(agent, id, req.LeaseToken)
	if errors.Is(err, jobs.ErrLeaseMismatch) {
		// Idempotent retry: the same lease already completed this job.
		if job != nil && job.LeaseToken == req.LeaseToken && req.LeaseToken != "" &&
			(job.Status == models.AgentJobCompleted || job.Status == models.AgentJobFailed) {
			writeJSON(w, http.StatusOK, map[string]string{"status": "already_completed"})
			return
		}
		writeErr(w, http.StatusConflict, "lease_invalid", "lease is no longer valid")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", "lookup failed")
		return
	}
	if err := a.orch.CompleteJob(r.Context(), agent, job, req); err != nil {
		if errors.Is(err, jobs.ErrLeaseMismatch) {
			writeErr(w, http.StatusConflict, "lease_invalid", "lease is no longer valid")
			return
		}
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "completed"})
}

// ipLimiter is a small per-IP token bucket.
type ipLimiter struct {
	mu    sync.Mutex
	r     rate.Limit
	b     int
	m     map[string]*rate.Limiter
	reset time.Time
}

func newIPLimiter(r rate.Limit, b int) *ipLimiter {
	return &ipLimiter{r: r, b: b, m: map[string]*rate.Limiter{}, reset: time.Now()}
}

func (l *ipLimiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if time.Since(l.reset) > time.Hour {
		l.m = map[string]*rate.Limiter{}
		l.reset = time.Now()
	}
	lim, ok := l.m[ip]
	if !ok {
		lim = rate.NewLimiter(l.r, l.b)
		l.m[ip] = lim
	}
	return lim.Allow()
}
