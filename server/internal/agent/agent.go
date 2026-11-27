package agent

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"runtime"
	"runtime/debug"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/monzim/db_proxy/v1/internal/agentproto"
	"github.com/monzim/db_proxy/v1/internal/pgexec"
)

// Agent is a running DumpStation Agent.
type Agent struct {
	cfg     *Config
	version string
	client  *Client
	runner  *pgexec.Runner
	conns   *Connections
	host    string

	mu      sync.Mutex
	running map[uuid.UUID]context.CancelFunc
	// proxyOnly flips on when direct-to-storage transfers fail in auto mode.
	proxyOnly bool
}

// New prepares an agent.
func New(cfg *Config, version string) (*Agent, error) {
	client, err := NewClient(cfg, version)
	if err != nil {
		return nil, err
	}
	conns, warnings, err := LoadConnections(cfg.ConnectionsFile)
	if err != nil {
		return nil, err
	}
	for _, w := range warnings {
		log.Printf("warning: %s", w)
	}
	host, _ := os.Hostname()
	return &Agent{
		cfg: cfg, version: version, client: client, conns: conns, host: host,
		runner:  pgexec.NewRunner(cfg.TempDir),
		running: map[uuid.UUID]context.CancelFunc{},
	}, nil
}

func (a *Agent) info() agentproto.AgentInfo {
	modes := []string{agentproto.TransferDirect, agentproto.TransferProxy}
	switch a.cfg.TransferMode {
	case agentproto.TransferDirect:
		modes = []string{agentproto.TransferDirect}
	case agentproto.TransferProxy:
		modes = []string{agentproto.TransferProxy}
	}
	return agentproto.AgentInfo{
		Version: a.version, Hostname: a.host, Platform: runtime.GOOS + "/" + runtime.GOARCH,
		PgVersions: a.runner.Tools.MajorStrings(), Connections: a.conns.List(), TransferModes: modes,
		AllowRestore: a.cfg.AllowRestore, MaxConcurrency: a.cfg.MaxConcurrency,
	}
}

// ensureCredential loads or obtains the agent credential.
func (a *Agent) ensureCredential(ctx context.Context) error {
	if a.cfg.Credential != "" {
		a.client.credential = a.cfg.Credential
		return nil
	}
	st, err := loadState(a.cfg.StateDir)
	tokenChanged := a.cfg.EnrollmentToken != "" && (st == nil || st.EnrolledWith != tokenHash(a.cfg.EnrollmentToken))
	if err == nil && st.Credential != "" && st.ServerURL == a.cfg.ServerURL && !tokenChanged {
		a.client.credential = st.Credential
		log.Printf("loaded credential for agent %q (%s)", st.AgentName, st.AgentID)
		return nil
	}
	if a.cfg.EnrollmentToken == "" {
		return errors.New("no stored credential and DUMPSTATION_ENROLLMENT_TOKEN is not set; create an enrollment token in DumpStation → Backup Agents")
	}
	log.Printf("enrolling with %s ...", a.cfg.ServerURL)
	var resp *agentproto.EnrollResponse
	for attempt := 1; ; attempt++ {
		resp, err = a.client.Enroll(ctx, a.cfg.EnrollmentToken, a.info())
		if err == nil {
			break
		}
		if errors.Is(err, ErrUnauthorized) {
			return fmt.Errorf("enrollment rejected: %w (tokens are single-use and expire; generate a new one)", err)
		}
		wait := backoff(attempt)
		log.Printf("enrollment failed: %v; retrying in %s", err, wait)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(wait):
		}
	}
	a.client.credential = resp.Credential
	if err := saveState(a.cfg.StateDir, &state{
		ServerURL: a.cfg.ServerURL, AgentID: resp.AgentID.String(), AgentName: resp.AgentName,
		Credential: resp.Credential, EnrolledWith: tokenHash(a.cfg.EnrollmentToken), EnrolledAt: time.Now(),
	}); err != nil {
		return fmt.Errorf("enrolled, but could not persist the credential in %s: %w (mount a writable volume)", a.cfg.StateDir, err)
	}
	log.Printf("enrolled as agent %q (%s)", resp.AgentName, resp.AgentID)
	return nil
}

func backoff(attempt int) time.Duration {
	d := time.Duration(1<<min(attempt, 6)) * time.Second
	if d > time.Minute {
		d = time.Minute
	}
	return d
}

func (a *Agent) touchHealth() {
	_ = os.MkdirAll(a.cfg.StateDir, 0o700)
	_ = os.WriteFile(heartbeatFile(a.cfg.StateDir), []byte(time.Now().UTC().Format(time.RFC3339)), 0o600)
}

func (a *Agent) runningIDs() []uuid.UUID {
	a.mu.Lock()
	defer a.mu.Unlock()
	ids := make([]uuid.UUID, 0, len(a.running))
	for id := range a.running {
		ids = append(ids, id)
	}
	return ids
}

// Run executes until ctx is cancelled.
func (a *Agent) Run(ctx context.Context) error {
	if a.cfg.InsecureTLS {
		log.Printf("WARNING: TLS certificate verification is DISABLED (DUMPSTATION_INSECURE_SKIP_VERIFY)")
	}
	if strings.HasPrefix(a.cfg.ServerURL, "http://") {
		log.Printf("WARNING: server URL is not HTTPS; credentials and job data travel unencrypted")
	}
	log.Printf("DumpStation Agent %s (%s) — PostgreSQL clients %v, %d local connection(s), restore %s",
		a.version, runtime.GOOS+"/"+runtime.GOARCH, a.runner.Tools.Majors(), len(a.conns.byName),
		map[bool]string{true: "enabled", false: "disabled"}[a.cfg.AllowRestore])
	if len(a.runner.Tools.Majors()) == 0 {
		log.Printf("WARNING: no PostgreSQL client tools found; backups will fail")
	}
	if err := a.ensureCredential(ctx); err != nil {
		return err
	}
	workCtx, cancelWork := context.WithCancel(context.Background())
	defer cancelWork()

	var wg sync.WaitGroup
	fatal := make(chan error, 1)
	wg.Add(1)
	go func() {
		defer wg.Done()
		a.heartbeatLoop(ctx, fatal)
	}()
	for i := 0; i < a.cfg.MaxConcurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			a.pollLoop(ctx, workCtx, fatal)
		}()
	}
	var err error
	select {
	case <-ctx.Done():
	case err = <-fatal:
	}
	// Graceful shutdown: let running jobs finish within the grace period.
	// Jobs still running after it are abandoned; the server retries them
	// when their lease expires.
	if n := len(a.runningIDs()); n > 0 {
		log.Printf("waiting up to %s for %d running job(s)", a.cfg.ShutdownGrace, n)
		deadline := time.After(a.cfg.ShutdownGrace)
	wait:
		for len(a.runningIDs()) > 0 {
			select {
			case <-deadline:
				break wait
			case <-time.After(500 * time.Millisecond):
			}
		}
	}
	cancelWork()
	wg.Wait()
	return err
}

func (a *Agent) heartbeatLoop(ctx context.Context, fatal chan<- error) {
	t := time.NewTicker(20 * time.Second)
	defer t.Stop()
	for {
		hctx, cancel := context.WithTimeout(ctx, 20*time.Second)
		resp, err := a.client.Heartbeat(hctx, a.info(), a.runningIDs())
		cancel()
		switch {
		case errors.Is(err, ErrUnauthorized):
			select {
			case fatal <- fmt.Errorf("%w; this agent was revoked or its credential rotated — re-enroll with a new token", err):
			default:
			}
			return
		case err != nil:
			if ctx.Err() == nil {
				log.Printf("heartbeat failed: %v", err)
			}
		default:
			a.touchHealth()
			for _, id := range resp.CancelJobs {
				a.mu.Lock()
				if c, ok := a.running[id]; ok {
					log.Printf("job %s cancelled by server", id)
					c()
				}
				a.mu.Unlock()
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

func (a *Agent) pollLoop(ctx, workCtx context.Context, fatal chan<- error) {
	attempt := 0
	for ctx.Err() == nil {
		job, err := a.client.Next(ctx, 25*time.Second)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			if errors.Is(err, ErrUnauthorized) {
				select {
				case fatal <- err:
				default:
				}
				return
			}
			attempt++
			wait := backoff(attempt)
			log.Printf("poll failed: %v; retrying in %s", err, wait)
			select {
			case <-ctx.Done():
				return
			case <-time.After(wait):
			}
			continue
		}
		attempt = 0
		a.touchHealth()
		if job == nil {
			continue
		}
		a.execute(workCtx, job)
	}
}

// execute runs one job with panic isolation and server-driven cancellation.
func (a *Agent) execute(parent context.Context, job *agentproto.Job) {
	timeout := time.Duration(job.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 6 * time.Hour
	}
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()
	a.mu.Lock()
	if _, dup := a.running[job.ID]; dup {
		a.mu.Unlock()
		return // duplicate delivery of a job already running here
	}
	a.running[job.ID] = cancel
	a.mu.Unlock()
	defer func() {
		a.mu.Lock()
		delete(a.running, job.ID)
		a.mu.Unlock()
	}()
	log.Printf("job %s: %s (attempt %d)", job.ID, job.Kind, job.Attempt)

	var res agentproto.CompleteRequest
	func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("PANIC in job %s: %v\n%s", job.ID, r, debug.Stack())
				res = failure(&pgexec.Error{Code: pgexec.CodeUnknown, Message: "agent internal error"})
			}
		}()
		switch job.Kind {
		case agentproto.KindBackup:
			res = a.runBackup(ctx, job)
		case agentproto.KindRestore:
			res = a.runRestore(ctx, job)
		case agentproto.KindTestConnection:
			res = a.runTest(ctx, job)
		default:
			res = failure(pgexec.Errorf(pgexec.CodeConfigError, "unsupported job kind %q", job.Kind))
		}
	}()
	if parent.Err() != nil {
		// Shutting down: do not report; the lease expires and the server retries.
		log.Printf("job %s abandoned due to shutdown", job.ID)
		return
	}
	cctx, ccancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer ccancel()
	if err := a.client.Complete(cctx, job, res); err != nil {
		log.Printf("job %s: could not report completion: %v", job.ID, err)
		return
	}
	if res.OK {
		log.Printf("job %s: completed", job.ID)
	} else {
		log.Printf("job %s: failed (%s): %s", job.ID, res.ErrorCode, res.ErrorMessage)
	}
}

func failure(e *pgexec.Error) agentproto.CompleteRequest {
	return agentproto.CompleteRequest{OK: false, ErrorCode: e.Code, ErrorMessage: e.Message, ErrorDetail: e.Detail}
}

// report posts a progress event; it cancels the job when the server says so.
func (a *Agent) report(ctx context.Context, cancel context.CancelFunc, job *agentproto.Job, stage, level, msg string) {
	rctx, rc := context.WithTimeout(ctx, 20*time.Second)
	defer rc()
	cancelled, err := a.client.Event(rctx, job, stage, level, msg)
	if errors.Is(err, ErrLeaseInvalid) || cancelled {
		cancel()
	}
}

func (a *Agent) resolve(ref agentproto.ConnRef) (pgexec.Conn, *pgexec.Error) {
	if ref.Connection != "" {
		c, ok := a.conns.Resolve(ref.Connection)
		if !ok {
			return c, pgexec.Errorf(pgexec.CodeConfigError,
				"connection %q is not defined on this agent (check DUMPSTATION_CONN_* or the connections file)", ref.Connection)
		}
		return c, nil
	}
	if ref.Conn == nil {
		return pgexec.Conn{}, pgexec.Errorf(pgexec.CodeConfigError, "job has no connection details")
	}
	return *ref.Conn, nil
}

func (a *Agent) cancelledErr(ctx context.Context) *pgexec.Error {
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return &pgexec.Error{Code: pgexec.CodeTimeout, Message: "Job exceeded its time limit on the agent"}
	}
	return &pgexec.Error{Code: pgexec.CodeCancelled, Message: "Cancelled by user"}
}

func (a *Agent) runTest(ctx context.Context, job *agentproto.Job) agentproto.CompleteRequest {
	if job.Test == nil {
		return failure(pgexec.Errorf(pgexec.CodeConfigError, "missing test spec"))
	}
	conn, perr := a.resolve(job.Test.Target)
	var result pgexec.TestResult
	if perr != nil {
		result = pgexec.TestResult{Code: perr.Code, Message: perr.Message}
	} else {
		result = a.runner.TestConnection(ctx, conn)
	}
	raw, _ := json.Marshal(result)
	return agentproto.CompleteRequest{OK: true, Result: raw}
}

func (a *Agent) useProxy(job []string) bool {
	if a.cfg.TransferMode == agentproto.TransferProxy {
		return true
	}
	if a.cfg.TransferMode == agentproto.TransferDirect {
		return false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.proxyOnly
}

func (a *Agent) runBackup(parent context.Context, job *agentproto.Job) agentproto.CompleteRequest {
	spec := job.Backup
	if spec == nil {
		return failure(pgexec.Errorf(pgexec.CodeConfigError, "missing backup spec"))
	}
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	conn, perr := a.resolve(spec.Source)
	if perr != nil {
		return failure(perr)
	}
	a.report(ctx, cancel, job, "preparing", "info", fmt.Sprintf("Connecting to %s from agent host %s", conn.Redacted(), a.host))
	a.report(ctx, cancel, job, "dumping", "info", "Running pg_dump (custom format)")
	res, err := a.runner.Dump(ctx, conn, pgexec.DumpOptions{Compression: spec.Compression, MinFreeBytes: a.cfg.MinFreeBytes})
	if err != nil {
		if ctx.Err() != nil {
			return failure(a.cancelledErr(ctx))
		}
		return failure(pgexec.AsError(err))
	}
	defer os.Remove(res.Path)
	a.report(ctx, cancel, job, "dumping", "info", fmt.Sprintf("Dump finished: %d bytes in %s (server %s, pg_dump %d)",
		res.Size, res.Duration.Round(time.Second), res.ServerVersion, res.ClientMajor))

	out := agentproto.CompleteRequest{OK: true, SizeBytes: res.Size, SHA256: res.SHA256, Format: res.Format, ServerVersion: res.ServerVersion}
	allowed := map[string]bool{}
	for _, m := range spec.TransferModes {
		allowed[m] = true
	}
	tryDirect := allowed[agentproto.TransferDirect] && !a.useProxy(nil)
	if tryDirect {
		a.report(ctx, cancel, job, "uploading", "info", "Uploading directly to object storage")
		parts, err := a.uploadDirect(ctx, job, res.Path, res.Size, spec.PartSize)
		if err == nil {
			out.TransferMode, out.Parts = agentproto.TransferDirect, parts
			return out
		}
		if ctx.Err() != nil {
			return failure(a.cancelledErr(ctx))
		}
		if errors.Is(err, ErrLeaseInvalid) {
			return failure(&pgexec.Error{Code: pgexec.CodeCancelled, Message: "Lease lost during upload"})
		}
		if a.cfg.TransferMode != "auto" || !allowed[agentproto.TransferProxy] {
			return failure(&pgexec.Error{Code: pgexec.CodeUploadFailed, Message: "Direct upload to storage failed", Detail: pgexec.Sanitize(err.Error())})
		}
		a.report(ctx, cancel, job, "uploading", "warning", fmt.Sprintf("Direct upload failed (%s); falling back to upload through the DumpStation server", pgexec.Sanitize(err.Error())))
		a.mu.Lock()
		a.proxyOnly = true
		a.mu.Unlock()
	} else {
		a.report(ctx, cancel, job, "uploading", "info", "Uploading through the DumpStation server")
	}
	if err := a.client.ProxyUpload(ctx, job, res.Path, res.SHA256, res.Size); err != nil {
		if ctx.Err() != nil {
			return failure(a.cancelledErr(ctx))
		}
		return failure(&pgexec.Error{Code: pgexec.CodeUploadFailed, Message: "Upload through the server failed", Detail: pgexec.Sanitize(err.Error())})
	}
	out.TransferMode = agentproto.TransferProxy
	return out
}

// uploadDirect streams the file in fixed-size parts to presigned URLs. Each
// part is read from disk on demand, so memory use is one part buffer.
func (a *Agent) uploadDirect(ctx context.Context, job *agentproto.Job, path string, size, partSize int64) ([]agentproto.Part, error) {
	if partSize < 5<<20 {
		partSize = 64 << 20
	}
	for size/partSize >= 10000 {
		partSize *= 2
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var parts []agentproto.Part
	for n, off := int64(1), int64(0); off < size; n, off = n+1, off+partSize {
		length := partSize
		if off+length > size {
			length = size - off
		}
		var etag string
		var lastErr error
		for attempt := 1; attempt <= 4; attempt++ {
			url, err := a.client.PartURL(ctx, job, n)
			if err != nil {
				if errors.Is(err, ErrLeaseInvalid) {
					return nil, err
				}
				lastErr = err
			} else {
				etag, lastErr = a.client.PutPart(ctx, url, io.NewSectionReader(f, off, length), length)
				if lastErr == nil {
					break
				}
			}
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			// First part failing outright usually means the storage endpoint
			// is unreachable from here: give up quickly so auto mode can fall back.
			if n == 1 && attempt >= 2 {
				break
			}
			time.Sleep(time.Duration(attempt) * 2 * time.Second)
		}
		if lastErr != nil {
			return nil, fmt.Errorf("part %d: %w", n, lastErr)
		}
		parts = append(parts, agentproto.Part{PartNumber: n, ETag: etag})
	}
	return parts, nil
}

func (a *Agent) runRestore(parent context.Context, job *agentproto.Job) agentproto.CompleteRequest {
	spec := job.Restore
	if spec == nil {
		return failure(pgexec.Errorf(pgexec.CodeConfigError, "missing restore spec"))
	}
	if !a.cfg.AllowRestore {
		return failure(pgexec.Errorf(pgexec.CodeConfigError, "restores are disabled on this agent (set DUMPSTATION_ALLOW_RESTORE=true)"))
	}
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	conn, perr := a.resolve(spec.Target)
	if perr != nil {
		return failure(perr)
	}
	f, err := os.CreateTemp(a.cfg.TempDir, "dumpstation-restore-*")
	if err != nil {
		return failure(pgexec.AsError(err))
	}
	path := f.Name()
	defer os.Remove(path)
	h := sha256.New()
	w := io.MultiWriter(f, h)

	a.report(ctx, cancel, job, "downloading", "info", "Downloading backup artifact")
	var dlErr error
	direct := !a.useProxy(nil)
	if direct {
		url, err := a.client.DownloadURL(ctx, job)
		if err == nil {
			_, dlErr = a.client.GetURL(ctx, url, w)
		} else {
			dlErr = err
		}
		if dlErr != nil && a.cfg.TransferMode == "auto" && ctx.Err() == nil && !errors.Is(dlErr, ErrLeaseInvalid) {
			a.report(ctx, cancel, job, "downloading", "warning", "Direct download failed; retrying through the DumpStation server")
			_ = f.Truncate(0)
			_, _ = f.Seek(0, 0)
			h.Reset()
			direct = false
		}
	}
	if !direct {
		_, dlErr = a.client.ProxyDownload(ctx, job, w)
	}
	f.Close()
	if dlErr != nil {
		if ctx.Err() != nil {
			return failure(a.cancelledErr(ctx))
		}
		return failure(&pgexec.Error{Code: pgexec.CodeDownloadFailed, Message: "Could not download the backup artifact", Detail: pgexec.Sanitize(dlErr.Error())})
	}
	if spec.SHA256 != "" {
		if got := hex.EncodeToString(h.Sum(nil)); got != spec.SHA256 {
			return failure(pgexec.Errorf(pgexec.CodeVerifyFailed, "Downloaded artifact does not match its recorded SHA-256 checksum"))
		}
		a.report(ctx, cancel, job, "downloading", "info", "Checksum verified")
	}
	format := pgexec.DetectFormat(path)
	a.report(ctx, cancel, job, "restoring", "info", fmt.Sprintf("Restoring into %s (%s format)", conn.Redacted(), format))
	if err := a.runner.Restore(ctx, conn, path, pgexec.RestoreOptions{Format: format, Clean: spec.Clean}); err != nil {
		if ctx.Err() != nil {
			return failure(a.cancelledErr(ctx))
		}
		return failure(pgexec.AsError(err))
	}
	return agentproto.CompleteRequest{OK: true}
}

// Healthcheck exits non-zero when the agent has not reached the server recently.
func Healthcheck(stateDir string, maxAge time.Duration) error {
	b, err := os.ReadFile(heartbeatFile(stateDir))
	if err != nil {
		return fmt.Errorf("no successful server contact recorded yet")
	}
	t, err := time.Parse(time.RFC3339, strings.TrimSpace(string(b)))
	if err != nil {
		return err
	}
	if age := time.Since(t); age > maxAge {
		return fmt.Errorf("last successful server contact %s ago", age.Round(time.Second))
	}
	return nil
}
