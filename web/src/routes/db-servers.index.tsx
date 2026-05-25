import { AppLayout } from "@/components/app-layout";
import { DbServerList } from "@/components/db-server-list";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import {
  KpiTile,
  LiveDot,
  PageBriefing,
  SectionRule,
  useNow,
} from "@/components/ui/page-briefing";
import { Skeleton } from "@/components/ui/skeleton";
import { useDbServers } from "@/lib/api/db-servers";
import type { ServerConnection } from "@/lib/types/api";
import { cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  CircleCheck,
  CircleSlash,
  Lock,
  Server,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useMemo } from "react";

export const Route = createFileRoute("/db-servers/")({
  component: DbServersIndexPage,
  head: () => ({
    meta: [
      { title: "DB Servers - DumpStation" },
      {
        name: "description",
        content:
          "Administer PostgreSQL servers — create databases, manage users, and grant access without leaving DumpStation.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Server health classification
// ─────────────────────────────────────────────────────────────────────────────

type ServerHealth = "healthy" | "degraded" | "untested";

function classify(s: ServerConnection): ServerHealth {
  if (!s.last_tested_at || !s.last_test_status) return "untested";
  if (s.last_test_status.toLowerCase() === "ok") return "healthy";
  return "degraded";
}

const healthMeta: Record<
  ServerHealth,
  { label: string; bar: string; text: string; ring: string }
> = {
  healthy: { label: "Healthy", bar: "bg-success", text: "text-success", ring: "ring-success/40" },
  degraded: { label: "Degraded", bar: "bg-error", text: "text-error", ring: "ring-error/40" },
  untested: { label: "Untested", bar: "bg-mute", text: "text-mute", ring: "ring-mute/30" },
};

// SSL mode breakdown
const sslMeta: Record<string, { label: string; bar: string }> = {
  require: { label: "Require", bar: "bg-success" },
  prefer: { label: "Prefer", bar: "bg-amber-400" },
  disable: { label: "Disable", bar: "bg-error" },
  unknown: { label: "Unknown", bar: "bg-mute" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Health row breakdown
// ─────────────────────────────────────────────────────────────────────────────

function HealthMix({ servers }: { servers: ServerConnection[] }) {
  const counts: Record<ServerHealth, number> = {
    healthy: 0,
    degraded: 0,
    untested: 0,
  };
  for (const s of servers) counts[classify(s)] += 1;
  const total = servers.length;
  const safe = Math.max(1, total);

  const order: ServerHealth[] = ["healthy", "degraded", "untested"];

  return (
    <div className="space-y-4">
      <div className="flex h-3 w-full rounded-full overflow-hidden border border-hairline-soft bg-canvas-soft">
        {order.map((k) => {
          const pct = (counts[k] / safe) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={k}
              className={cn("h-full transition-all duration-500", healthMeta[k].bar)}
              style={{ width: `${pct}%` }}
              title={`${healthMeta[k].label}: ${counts[k]}`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {order.map((k) => (
          <div key={k} className="space-y-1">
            <span className={cn("inline-block size-2 rounded-full", healthMeta[k].bar)} />
            <p className={cn("text-heading-sm tabular-nums", healthMeta[k].text)}>{counts[k]}</p>
            <p className="text-mono-caps uppercase text-mute">{healthMeta[k].label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SslMix({ servers }: { servers: ServerConnection[] }) {
  const counts = new Map<string, number>();
  for (const s of servers) {
    const k = s.ssl_mode ?? "unknown";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const total = servers.length;
  const safe = Math.max(1, total);
  const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <div className="flex h-3 w-full rounded-full overflow-hidden border border-hairline-soft bg-canvas-soft">
        {entries.map(([key, count]) => {
          const pct = (count / safe) * 100;
          const meta = sslMeta[key] ?? sslMeta.unknown;
          return (
            <div
              key={key}
              className={cn("h-full transition-all duration-500", meta.bar)}
              style={{ width: `${pct}%` }}
              title={`${meta.label}: ${count}`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-caption">
        {entries.map(([key, count]) => {
          const meta = sslMeta[key] ?? sslMeta.unknown;
          return (
            <div key={key} className="flex items-center gap-2">
              <span className={cn("size-2 rounded-full", meta.bar)} />
              <span className="text-ash flex-1">{meta.label}</span>
              <span className="text-mono-caps uppercase text-mute tabular-nums">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Server grid — quick visual roster (compact cards)
// ─────────────────────────────────────────────────────────────────────────────

function ServerGrid({ servers }: { servers: ServerConnection[] }) {
  if (servers.length === 0) {
    return (
      <div className="text-center py-6 space-y-2">
        <Server className="size-7 mx-auto text-ash" />
        <p className="text-caption text-ash">No server connections yet.</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {servers.map((s) => {
        const health = classify(s);
        const meta = healthMeta[health];
        return (
          <div
            key={s.id}
            className={cn(
              "rounded-app-md border border-hairline-soft bg-canvas-soft p-4 transition-all hover:border-graphite/80",
              "group flex items-start gap-3",
            )}
          >
            <div
              className={cn(
                "size-9 rounded-app-sm flex items-center justify-center ring-1 shrink-0",
                meta.ring,
                "bg-canvas-soft",
              )}
            >
              {health === "healthy" ? (
                <ShieldCheck className={cn("size-4", meta.text)} />
              ) : health === "degraded" ? (
                <ShieldAlert className={cn("size-4", meta.text)} />
              ) : (
                <Server className={cn("size-4", meta.text)} />
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-body-sm font-medium text-on-primary truncate">{s.name}</p>
                <Badge
                  variant={
                    health === "healthy" ? "success" : health === "degraded" ? "error" : "mono"
                  }
                >
                  {meta.label}
                </Badge>
              </div>
              <p className="text-mono-micro uppercase text-mute truncate">
                {s.host}:{s.port}
              </p>
              <div className="flex items-center gap-3 text-mono-micro uppercase text-mute">
                <span className="inline-flex items-center gap-1">
                  <Lock className="size-2.5" />
                  SSL · {s.ssl_mode ?? "?"}
                </span>
                {s.last_tested_at && (
                  <span>
                    tested {formatDistanceToNow(new Date(s.last_tested_at), { addSuffix: true })}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

function DbServersIndexPage() {
  const { data: servers, isLoading } = useDbServers();
  const now = useNow();

  const list = servers ?? [];
  const counts = useMemo(() => {
    const c = { healthy: 0, degraded: 0, untested: 0 } as Record<ServerHealth, number>;
    for (const s of list) c[classify(s)] += 1;
    return c;
  }, [list]);

  const sslRequire = list.filter((s) => s.ssl_mode === "require").length;
  const lastTested = useMemo(
    () =>
      list
        .filter((s) => s.last_tested_at)
        .sort(
          (a, b) =>
            new Date(b.last_tested_at!).getTime() - new Date(a.last_tested_at!).getTime(),
        )[0],
    [list],
  );

  return (
    <AppLayout>
      <div className="space-y-12 animate-in fade-in duration-500">
        <PageBriefing
          eyebrow={`Infrastructure · Server registry · ${now.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}`}
          title="Database"
          echo="servers."
          subtitle="Administer PostgreSQL servers — create databases, manage users, and grant access without leaving DumpStation."
          ledger={[
            {
              label: "Live",
              value: (
                <span className="inline-flex items-center gap-2">
                  <LiveDot tone={counts.degraded === 0 ? "success" : "danger"} />
                  {now.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  })}
                </span>
              ),
            },
            { label: "Servers", value: list.length.toString() },
            {
              label: "Healthy",
              value: `${counts.healthy}/${list.length || 0}`,
            },
          ]}
        />

        {/* KPI strip */}
        <section className="space-y-4">
          <SectionRule label="01 · Indicators" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiTile
              label="Total servers"
              icon={Server}
              value={list.length}
              hint={`${counts.healthy} healthy · ${counts.degraded} degraded`}
              isLoading={isLoading}
            />
            <KpiTile
              label="Healthy"
              icon={ShieldCheck}
              tone="success"
              value={counts.healthy}
              hint={`${list.length > 0 ? ((counts.healthy / list.length) * 100).toFixed(0) : 0}% of fleet`}
              isLoading={isLoading}
            />
            <KpiTile
              label="Untested"
              icon={CircleSlash}
              tone={counts.untested > 0 ? "warning" : "default"}
              value={counts.untested}
              hint={counts.untested === 0 ? "All probed" : "Awaiting connectivity check"}
              isLoading={isLoading}
            />
            <KpiTile
              label="SSL · require"
              icon={Lock}
              tone={sslRequire === list.length && list.length > 0 ? "success" : "warning"}
              value={`${sslRequire}/${list.length || 0}`}
              hint={
                lastTested
                  ? `last test ${formatDistanceToNow(new Date(lastTested.last_tested_at!), { addSuffix: true })}`
                  : "No tests recorded"
              }
              isLoading={isLoading}
            />
          </div>
        </section>

        {/* Snapshot grid */}
        <section className="space-y-4">
          <SectionRule label="02 · Snapshot" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <Card className="lg:col-span-6 p-0 overflow-hidden">
              <div className="border-b border-hairline-soft p-6 lg:p-8">
                <Eyebrow>Connectivity</Eyebrow>
                <p className="text-heading-sm text-on-primary mt-1">Health from the latest probe</p>
              </div>
              <div className="p-6 lg:p-8">
                {isLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : list.length === 0 ? (
                  <div className="text-center py-6 space-y-2">
                    <CircleCheck className="size-7 mx-auto text-ash" />
                    <p className="text-caption text-ash">
                      Connect your first server to start tracking health.
                    </p>
                  </div>
                ) : (
                  <HealthMix servers={list} />
                )}
              </div>
            </Card>

            <Card className="lg:col-span-6 p-0 overflow-hidden">
              <div className="border-b border-hairline-soft p-6 lg:p-8 flex items-start justify-between gap-4">
                <div>
                  <Eyebrow>Transport · TLS posture</Eyebrow>
                  <p className="text-heading-sm text-on-primary mt-1">SSL mode breakdown</p>
                </div>
                <Badge variant="mono">
                  <Lock className="size-2.5" /> Per-server
                </Badge>
              </div>
              <div className="p-6 lg:p-8">
                {isLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : list.length === 0 ? (
                  <div className="text-center py-6 space-y-2">
                    <Lock className="size-7 mx-auto text-ash" />
                    <p className="text-caption text-ash">No SSL data yet.</p>
                  </div>
                ) : (
                  <SslMix servers={list} />
                )}
              </div>
            </Card>
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="border-b border-hairline-soft p-6 lg:p-8 flex items-start justify-between gap-4">
              <div>
                <Eyebrow>Server map</Eyebrow>
                <p className="text-heading-sm text-on-primary mt-1">Quick visual roster</p>
              </div>
              <Badge variant="mono">
                <Server className="size-2.5" /> {list.length}
              </Badge>
            </div>
            <div className="p-6 lg:p-8">
              {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : (
                <ServerGrid servers={list} />
              )}
            </div>
          </Card>
        </section>

        {/* Existing roster */}
        <section className="space-y-4">
          <SectionRule label="03 · Management" />
          <DbServerList />
        </section>
      </div>
    </AppLayout>
  );
}
