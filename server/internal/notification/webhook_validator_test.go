package notification

import (
	"net"
	"testing"
)

func TestIsBlocked(t *testing.T) {
	cases := map[string]bool{
		"162.159.137.232": false, // discord.com
		"8.8.8.8":         false,
		"127.0.0.1":       true,
		"10.1.2.3":        true,
		"169.254.169.254": true,
		"::1":             true,
		"fd00::1":         true,
		"2606:4700::1":    false,
		"::ffff:10.0.0.1": true, // mapped private address
	}
	for ip, want := range cases {
		if got := isBlocked(net.ParseIP(ip)); got != want {
			t.Errorf("isBlocked(%s) = %v, want %v", ip, got, want)
		}
	}
}
