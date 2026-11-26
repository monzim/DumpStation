package pgexec

import (
	"context"
	"fmt"
	"net"
	"strings"
	"time"
)

// CIDRPolicy returns a HostPolicy that only allows hosts whose every
// resolved address falls inside one of the given CIDRs (comma separated).
// An empty list returns nil (no restriction).
func CIDRPolicy(list string) (func(string) error, error) {
	var nets []*net.IPNet
	for _, part := range strings.Split(list, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if !strings.Contains(part, "/") {
			if strings.Contains(part, ":") {
				part += "/128"
			} else {
				part += "/32"
			}
		}
		_, n, err := net.ParseCIDR(part)
		if err != nil {
			return nil, fmt.Errorf("invalid CIDR %q", part)
		}
		nets = append(nets, n)
	}
	if len(nets) == 0 {
		return nil, nil
	}
	return func(host string) error {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil || len(ips) == 0 {
			return fmt.Errorf("could not resolve database host %q", host)
		}
		for _, ip := range ips {
			ok := false
			for _, n := range nets {
				if n.Contains(ip.IP) {
					ok = true
					break
				}
			}
			if !ok {
				return fmt.Errorf("direct connections to %s are not allowed by this server (DIRECT_ALLOWED_CIDRS); use an agent", ip.IP)
			}
		}
		return nil
	}, nil
}
