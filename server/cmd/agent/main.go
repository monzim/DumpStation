// Command dumpstation-agent runs a DumpStation Agent: an outbound-only
// backup worker for PostgreSQL databases in private networks.
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/monzim/db_proxy/v1/internal/agent"
	"github.com/monzim/db_proxy/v1/internal/pgexec"
)

// version is set at build time with -ldflags "-X main.version=...".
var version = "dev"

func main() {
	log.SetFlags(log.LstdFlags | log.LUTC)
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "version", "--version", "-v":
			fmt.Println(version)
			return
		case "healthcheck":
			dir := os.Getenv("DUMPSTATION_STATE_DIR")
			if dir == "" {
				dir = "/var/lib/dumpstation-agent"
			}
			if err := agent.Healthcheck(dir, 2*time.Minute); err != nil {
				fmt.Fprintln(os.Stderr, "unhealthy:", err)
				os.Exit(1)
			}
			fmt.Println("healthy")
			return
		case "connections":
			// Print the connections this agent would report (no secrets).
			cfgPath := os.Getenv("DUMPSTATION_CONNECTIONS_FILE")
			if cfgPath == "" {
				cfgPath = "/etc/dumpstation-agent/connections.yaml"
			}
			conns, warnings, err := agent.LoadConnections(cfgPath)
			if err != nil {
				log.Fatal(err)
			}
			for _, w := range warnings {
				fmt.Fprintln(os.Stderr, "warning:", w)
			}
			for _, c := range conns.List() {
				fmt.Printf("%-24s %s @ %s\n", c.Name, c.Database, c.Host)
			}
			return
		case "tools":
			fmt.Println("PostgreSQL client versions:", pgexec.DiscoverTools().Majors())
			return
		case "help", "--help", "-h":
			fmt.Println("usage: dumpstation-agent [run|healthcheck|connections|tools|version]")
			return
		case "run":
		default:
			fmt.Fprintf(os.Stderr, "unknown command %q\n", os.Args[1])
			os.Exit(2)
		}
	}
	cfg, err := agent.LoadConfig()
	if err != nil {
		log.Fatalf("configuration error: %v", err)
	}
	a, err := agent.New(cfg, version)
	if err != nil {
		log.Fatalf("startup error: %v", err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	if err := a.Run(ctx); err != nil {
		log.Fatalf("agent stopped: %v", err)
	}
	log.Printf("agent stopped")
}
