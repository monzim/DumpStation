package notification

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"strings"
)

// allowedWebhookHosts enumerates the only hostnames the server will POST to
// for webhook notifications. Anything else is rejected to prevent SSRF —
// for example, an attacker could otherwise point the webhook URL at
// http://169.254.169.254/ to read cloud-instance metadata.
var allowedWebhookHosts = []string{
	"discord.com",
	"discordapp.com",
	"ptb.discord.com",
	"canary.discord.com",
}

// blockedCIDRs lists IP ranges that must never be the resolved target of a
// webhook URL. Covers loopback, link-local (incl. 169.254/16 metadata),
// IETF protocol assignments, RFC 1918 private space, and IPv6 equivalents.
var blockedCIDRs = mustParseCIDRs(
	"127.0.0.0/8",
	"10.0.0.0/8",
	"172.16.0.0/12",
	"192.168.0.0/16",
	"169.254.0.0/16",
	"100.64.0.0/10",
	"0.0.0.0/8",
	"::1/128",
	"fc00::/7",
	"fe80::/10",
	"::ffff:0:0/96",
)

// ValidateDiscordWebhookURL checks that the URL points at a Discord webhook
// endpoint, uses HTTPS, and resolves to a public IP. Returns nil when the
// URL is safe to call from server-side code.
//
// The check is best-effort: DNS rebinding can still defeat a TOCTOU gap
// between this validation and the actual HTTP request. Callers should
// pair this with an HTTP client that pins to the resolved IP, or run the
// notifier in an environment without access to internal services.
func ValidateDiscordWebhookURL(raw string) error {
	if strings.TrimSpace(raw) == "" {
		return errors.New("webhook URL is required")
	}

	parsed, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("invalid webhook URL: %w", err)
	}
	if parsed.Scheme != "https" {
		return fmt.Errorf("webhook URL must use https (got %q)", parsed.Scheme)
	}

	host := strings.ToLower(parsed.Hostname())
	if host == "" {
		return errors.New("webhook URL must include a host")
	}

	if !hostMatchesAllowList(host) {
		return fmt.Errorf("webhook host %q is not a recognized Discord domain", host)
	}

	// Resolve and reject if any answer falls in a blocked range. A single
	// public answer is not enough — every resolved address must be public,
	// otherwise the connection could be steered to a private host.
	ips, err := net.LookupIP(host)
	if err != nil {
		return fmt.Errorf("failed to resolve webhook host %q: %w", host, err)
	}
	if len(ips) == 0 {
		return fmt.Errorf("webhook host %q resolved to no addresses", host)
	}
	for _, ip := range ips {
		if isBlocked(ip) {
			return fmt.Errorf("webhook host %q resolves to blocked address %s", host, ip)
		}
	}

	return nil
}

func hostMatchesAllowList(host string) bool {
	for _, allowed := range allowedWebhookHosts {
		if host == allowed || strings.HasSuffix(host, "."+allowed) {
			return true
		}
	}
	return false
}

func isBlocked(ip net.IP) bool {
	for _, n := range blockedCIDRs {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

func mustParseCIDRs(cidrs ...string) []*net.IPNet {
	out := make([]*net.IPNet, 0, len(cidrs))
	for _, c := range cidrs {
		_, n, err := net.ParseCIDR(c)
		if err != nil {
			panic(fmt.Sprintf("notification: bad CIDR %q in blocked list: %v", c, err))
		}
		out = append(out, n)
	}
	return out
}
