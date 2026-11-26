package agent

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/monzim/db_proxy/v1/internal/agentproto"
)

// Errors with special handling.
var (
	ErrUnauthorized = errors.New("agent credential rejected by server")
	ErrLeaseInvalid = errors.New("lease no longer valid")
	errNoContent    = errors.New("no content")
)

// Client speaks the agent protocol to the server.
type Client struct {
	base       string
	credential string
	api        *http.Client // control-plane calls
	transfer   *http.Client // artifact transfers (no overall timeout)
	userAgent  string
}

func newTransport(cfg *Config) (*http.Transport, error) {
	tlsCfg := &tls.Config{MinVersion: tls.VersionTLS12}
	if cfg.CAFile != "" {
		pem, err := os.ReadFile(cfg.CAFile)
		if err != nil {
			return nil, fmt.Errorf("read CA file: %w", err)
		}
		pool, _ := x509.SystemCertPool()
		if pool == nil {
			pool = x509.NewCertPool()
		}
		if !pool.AppendCertsFromPEM(pem) {
			return nil, fmt.Errorf("CA file contains no certificates")
		}
		tlsCfg.RootCAs = pool
	}
	if cfg.InsecureTLS {
		tlsCfg.InsecureSkipVerify = true //nolint:gosec // explicit operator opt-in, logged loudly
	}
	return &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           (&net.Dialer{Timeout: 15 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
		TLSClientConfig:       tlsCfg,
		TLSHandshakeTimeout:   15 * time.Second,
		ResponseHeaderTimeout: 60 * time.Second,
		IdleConnTimeout:       90 * time.Second,
		MaxIdleConnsPerHost:   4,
	}, nil
}

// NewClient builds a client.
func NewClient(cfg *Config, version string) (*Client, error) {
	tr, err := newTransport(cfg)
	if err != nil {
		return nil, err
	}
	return &Client{
		base:      cfg.ServerURL,
		api:       &http.Client{Transport: tr, Timeout: 75 * time.Second},
		transfer:  &http.Client{Transport: tr},
		userAgent: "dumpstation-agent/" + version,
	}, nil
}

func (c *Client) url(path string) string {
	return c.base + "/agent/" + agentproto.Version + path
}

func (c *Client) do(ctx context.Context, method, path string, in, out any) error {
	var body io.Reader
	if in != nil {
		b, _ := json.Marshal(in)
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.url(path), body)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", c.userAgent)
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.credential != "" {
		req.Header.Set("Authorization", "Bearer "+c.credential)
	}
	resp, err := c.api.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return decodeResponse(resp, out)
}

func decodeResponse(resp *http.Response, out any) error {
	switch {
	case resp.StatusCode == http.StatusNoContent:
		return errNoContent
	case resp.StatusCode == http.StatusUnauthorized:
		var e agentproto.ErrorResponse
		_ = json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&e)
		return fmt.Errorf("%w: %s", ErrUnauthorized, e.Message)
	case resp.StatusCode == http.StatusConflict:
		return ErrLeaseInvalid
	case resp.StatusCode >= 300:
		var e agentproto.ErrorResponse
		_ = json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&e)
		if e.Message == "" {
			e.Message = resp.Status
		}
		return fmt.Errorf("server returned %d: %s", resp.StatusCode, e.Message)
	}
	if out == nil {
		_, _ = io.Copy(io.Discard, resp.Body)
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// Enroll exchanges an enrollment token for a credential.
func (c *Client) Enroll(ctx context.Context, token string, info agentproto.AgentInfo) (*agentproto.EnrollResponse, error) {
	var out agentproto.EnrollResponse
	err := c.do(ctx, http.MethodPost, "/enroll", agentproto.EnrollRequest{Token: token, Info: info}, &out)
	return &out, err
}

// Heartbeat reports liveness.
func (c *Client) Heartbeat(ctx context.Context, info agentproto.AgentInfo, running []uuid.UUID) (*agentproto.HeartbeatResponse, error) {
	var out agentproto.HeartbeatResponse
	err := c.do(ctx, http.MethodPost, "/heartbeat", agentproto.HeartbeatRequest{Info: info, RunningJobs: running}, &out)
	return &out, err
}

// Next long-polls for a job. Returns nil, nil when none is available.
func (c *Client) Next(ctx context.Context, wait time.Duration) (*agentproto.Job, error) {
	var job agentproto.Job
	err := c.do(ctx, http.MethodGet, "/jobs/next?wait="+strconv.Itoa(int(wait.Seconds())), nil, &job)
	if errors.Is(err, errNoContent) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &job, nil
}

// Event posts a stage/log line; returns true when the job was cancelled.
func (c *Client) Event(ctx context.Context, job *agentproto.Job, stage, level, msg string) (bool, error) {
	var out agentproto.EventResponse
	err := c.do(ctx, http.MethodPost, "/jobs/"+job.ID.String()+"/events",
		agentproto.EventRequest{LeaseToken: job.LeaseToken, Stage: stage, Level: level, Message: msg}, &out)
	return out.Cancel, err
}

// PartURL requests a presigned URL for one multipart part.
func (c *Client) PartURL(ctx context.Context, job *agentproto.Job, part int64) (string, error) {
	var out agentproto.URLResponse
	err := c.do(ctx, http.MethodPost, "/jobs/"+job.ID.String()+"/upload/part-url",
		agentproto.PartURLRequest{LeaseToken: job.LeaseToken, PartNumber: part}, &out)
	return out.URL, err
}

// DownloadURL requests a presigned GET URL for a restore artifact.
func (c *Client) DownloadURL(ctx context.Context, job *agentproto.Job) (string, error) {
	var out agentproto.URLResponse
	err := c.do(ctx, http.MethodPost, "/jobs/"+job.ID.String()+"/download-url",
		agentproto.LeaseRequest{LeaseToken: job.LeaseToken}, &out)
	return out.URL, err
}

// Complete reports the job outcome, retrying transient failures.
func (c *Client) Complete(ctx context.Context, job *agentproto.Job, req agentproto.CompleteRequest) error {
	req.LeaseToken = job.LeaseToken
	var err error
	for attempt := 0; attempt < 6; attempt++ {
		err = c.do(ctx, http.MethodPost, "/jobs/"+job.ID.String()+"/complete", req, nil)
		if err == nil || errors.Is(err, ErrLeaseInvalid) || errors.Is(err, ErrUnauthorized) {
			return err
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Duration(attempt+1) * 3 * time.Second):
		}
	}
	return err
}

// ProxyUpload streams the artifact through the server.
func (c *Client) ProxyUpload(ctx context.Context, job *agentproto.Job, path, sha string, size int64) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, c.url("/jobs/"+job.ID.String()+"/artifact"), f)
	if err != nil {
		return err
	}
	req.ContentLength = size
	req.Header.Set("Authorization", "Bearer "+c.credential)
	req.Header.Set("User-Agent", c.userAgent)
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set(agentproto.HeaderLeaseToken, job.LeaseToken)
	req.Header.Set(agentproto.HeaderSHA256, sha)
	resp, err := c.transfer.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return decodeResponse(resp, nil)
}

// ProxyDownload streams a restore artifact from the server into w.
func (c *Client) ProxyDownload(ctx context.Context, job *agentproto.Job, w io.Writer) (int64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.url("/jobs/"+job.ID.String()+"/artifact"), nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+c.credential)
	req.Header.Set("User-Agent", c.userAgent)
	req.Header.Set(agentproto.HeaderLeaseToken, job.LeaseToken)
	resp, err := c.transfer.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, decodeResponse(resp, nil)
	}
	return io.Copy(w, resp.Body)
}

// PutPart uploads one part to a presigned URL and returns its ETag.
func (c *Client) PutPart(ctx context.Context, url string, body io.ReadSeeker, size int64) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, body)
	if err != nil {
		return "", err
	}
	req.ContentLength = size
	resp, err := c.transfer.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return "", fmt.Errorf("storage returned %d: %s", resp.StatusCode, bytes.TrimSpace(b))
	}
	etag := resp.Header.Get("ETag")
	if etag == "" {
		return "", errors.New("storage response is missing the ETag header (check bucket CORS/expose headers)")
	}
	return etag, nil
}

// GetURL downloads a presigned URL into w.
func (c *Client) GetURL(ctx context.Context, url string, w io.Writer) (int64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	resp, err := c.transfer.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return 0, fmt.Errorf("storage returned %d: %s", resp.StatusCode, bytes.TrimSpace(b))
	}
	return io.Copy(w, resp.Body)
}
