import { AppLayout } from "@/components/app-layout";
import { DatabaseList } from "@/components/database-list";
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
import { useBackups } from "@/lib/api/backups";
import { useDatabases } from "@/lib/api/databases";
import type { Backup, DatabaseConfig } from "@/lib/types/api";
import { formatBytes } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  CalendarClock,
  Database,
  Pause,
  Play,
  Sparkles,
  XCircle,
  Zap,
} from "lucide-react";
import { useMemo } from "react";

export const Route = createFileRoute("/databases/")({
  component: DatabasesPage,
  head: () => ({
    meta: [
      { title: "Databases - DumpStation" },
      {
        name: "description",
        content:
          "Manage your PostgreSQL database configurations for automated backups.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Databases - DumpStation" },
      {
        property: "og:description",
        content:
          "Manage your PostgreSQL database configurations for automated backups.",
      },
      {
        property: "og:url",
        content: "https://dumpstation.monzim.com/databases",
      },
      { name: "twitter:title", content: "Databases - DumpStation" },
      {
        name: "twitter:description",
        content:
          "Manage your PostgreSQL database configurations for automated backups.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://dumpstation.monzim.com/databases",
      },
    ],
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Derivations
// ─────────────────────────────────────────────────────────────────────────────

type SchedBucket = "hourly" | "daily" | "weekly" | "monthly" | "custom";

function bucketFromCron(cron: string): SchedBucket {
  if (!cron) return "custom";
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return "custom";
  const [minute, hour, dom, , dow] = parts;
  // every N hours / hourly
  if (hour.startsWith("*/") || hour === "*") return "hourly";
  // monthly
  if (dom !== "*" && !dom.startsWith("*/")) return "monthly";
  // weekly
  if (dow !== "*") return "weekly";
  // daily
  if (dom === "*" && minute !== "*") return "daily";
  return "custom";
}

const schedBucketMeta: Record<SchedBucket, { label: string; bar: string }> = {
  hourly: { label: "Hourly", bar: "bg-link-blue-soft" },
  daily: { label: "Daily", bar: "bg-success" },
  weekly: { label: "Weekly", bar: "bg-amber-400" },
  monthly: { label: "Monthly", bar: "bg-brand" },
  custom: { label: "Custom", bar: "bg-mute" },
};

// Posture donut shared with dashboard concept
function PostureDonut({
  active,
  paused,
  disabled,
}: {
  active: number;
  paused: number;
  disabled: number;
}) {
  const total = active + paused + disabled;
  const safe = Math.max(1, total);
  const R = 56;
  const C = 2 * Math.PI * R;
  const activeArc = (active / safe) * C;
  const pausedArc = (paused / safe) * C;
  const disabledArc = (disabled / safe) * C;

  return (
    <div className="flex items-center justify-center">
      <div className="relative size-40">
        <svg viewBox="0 0 144 144" className="size-40 -rotate-90">
          <circle cx="72" cy="72" r={R} fill="none" stroke="var(--graphite)" strokeWidth="10" />
          <circle
            cx="72"
            cy="72"
            r={R}
            fill="none"
            stroke="var(--success)"
            strokeWidth="10"
            strokeDasharray={`${activeArc} ${C}`}
          />
          <circle
            cx="72"
            cy="72"
            r={R}
            fill="none"
            stroke="rgb(251 191 36)"
            strokeWidth="10"
            strokeDasharray={`${pausedArc} ${C}`}
            strokeDashoffset={-activeArc}
          />
          <circle
            cx="72"
            cy="72"
            r={R}
            fill="none"
            stroke="var(--mute)"
            strokeWidth="10"
            strokeDasharray={`${disabledArc} ${C}`}
            strokeDashoffset={-(activeArc + pausedArc)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-display-sm tabular-nums text-on-primary">{total}</span>
          <span className="text-mono-caps uppercase text-mute">databases</span>
        </div>
      </div>
    </div>
  );
}

function ScheduleDistribution({ databases }: { databases: DatabaseConfig[] }) {
  const distribution = useMemo(() => {
    const counts: Record<SchedBucket, number> = {
      hourly: 0,
      daily: 0,
      weekly: 0,
      monthly: 0,
      custom: 0,
    };
    for (const db of databases) counts[bucketFromCron(db.schedule)] += 1;
    return counts;
  }, [databases]);
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  const safeTotal = Math.max(1, total);
  const order: SchedBucket[] = ["hourly", "daily", "weekly", "monthly", "custom"];

  return (
    <div className="space-y-4">
      <div className="flex h-3 w-full rounded-full overflow-hidden border border-hairline-soft bg-canvas-soft">
        {order.map((b) => {
          const pct = (distribution[b] / safeTotal) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={b}
              className={cn("h-full transition-all duration-500", schedBucketMeta[b].bar)}
              style={{ width: `${pct}%` }}
              title={`${schedBucketMeta[b].label}: ${distribution[b]}`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-caption">
        {order
          .filter((b) => distribution[b] > 0)
          .map((b) => (
            <div key={b} className="flex items-center gap-2">
              <span className={cn("size-2 rounded-full", schedBucketMeta[b].bar)} />
              <span className="text-ash flex-1">{schedBucketMeta[b].label}</span>
              <span className="text-mono-caps uppercase text-mute tabular-nums">
                {distribution[b]}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

function TopStoragePanel({
  databases,
  backups,
}: {
  databases: DatabaseConfig[];
  backups: Backup[];
}) {
  const ranked = useMemo(() => {
    const map = new Map<string, { bytes: number; latestTs: number; latestStatus?: string }>();
    for (const b of backups) {
      if (b.status !== "success" || !b.size_bytes) continue;
      const cur = map.get(b.database_id) ?? { bytes: 0, latestTs: 0 };
      cur.bytes += b.size_bytes;
      const ts = new Date(b.timestamp).getTime();
      if (ts > cur.latestTs) {
        cur.latestTs = ts;
        cur.latestStatus = b.status;
      }
      map.set(b.database_id, cur);
    }
    return databases
      .map((db) => ({
        db,
        bytes: map.get(db.id)?.bytes ?? 0,
        latestTs: map.get(db.id)?.latestTs ?? 0,
      }))
      .filter((r) => r.bytes > 0)
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 5);
  }, [databases, backups]);

  const max = Math.max(1, ...ranked.map((r) => r.bytes));

  if (ranked.length === 0) {
    return (
      <div className="text-center py-6 space-y-2">
        <Database className="size-7 mx-auto text-ash" />
        <p className="text-caption text-ash">No backups yet — top databases will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {ranked.map((row, i) => {
        const pct = (row.bytes / max) * 100;
        const paused = row.db.paused;
        return (
          <div key={row.db.id} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2">
                <span className="text-mono-micro uppercase text-mute font-mono tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="text-body-sm text-on-primary truncate">{row.db.name}</p>
                {paused && <Badge variant="warning">Paused</Badge>}
              </div>
              <p className="text-mono-caps tabular-nums text-ash shrink-0">
                {formatBytes(row.bytes)}
              </p>
            </div>
            <div className="h-1 w-full bg-graphite/60 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  paused ? "bg-amber-400" : "bg-on-primary",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-mono-micro uppercase text-mute">
              {row.db.host}:{row.db.port} ·{" "}
              {row.latestTs > 0
                ? `last ${formatDistanceToNow(new Date(row.latestTs), { addSuffix: true })}`
                : "no runs"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

function DatabasesPage() {
  const { data: databases, isLoading } = useDatabases();
  const { data: backups } = useBackups();
  const now = useNow();

  const list = databases ?? [];
  const active = list.filter((d) => d.enabled && !d.paused);
  const paused = list.filter((d) => d.paused);
  const disabled = list.filter((d) => !d.enabled);

  const recentRun = useMemo(() => {
    if (!backups || backups.length === 0) return null;
    return [...backups].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )[0];
  }, [backups]);

  const totalSuccessBytes = useMemo(
    () =>
      (backups ?? [])
        .filter((b) => b.status === "success")
        .reduce((acc, b) => acc + (b.size_bytes ?? 0), 0),
    [backups],
  );
  const avgSize = active.length > 0 ? totalSuccessBytes / active.length : 0;

  return (
    <AppLayout>
      <div className="space-y-12 animate-in fade-in duration-500">
        <PageBriefing
          eyebrow={`Fleet · Configuration registry · ${now.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}`}
          title="Database"
          echo="configurations."
          subtitle="Every PostgreSQL instance DumpStation knows how to back up — edit a schedule, pause a database, or trigger a one-off backup."
          ledger={[
            {
              label: "Live",
              value: (
                <span className="inline-flex items-center gap-2">
                  <LiveDot tone={disabled.length === 0 && paused.length === 0 ? "success" : "warning"} />
                  {now.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  })}
                </span>
              ),
            },
            { label: "Fleet", value: `${active.length}/${list.length}` },
            { label: "Paused", value: paused.length.toString() },
          ]}
        />

        {/* KPI strip */}
        <section className="space-y-4">
          <SectionRule label="01 · Indicators" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiTile
              label="Total databases"
              icon={Database}
              value={list.length}
              hint={`${active.length} active · ${paused.length} paused · ${disabled.length} off`}
              isLoading={isLoading}
            />
            <KpiTile
              label="Active"
              icon={Play}
              tone="success"
              value={active.length}
              hint={`${list.length > 0 ? ((active.length / list.length) * 100).toFixed(0) : 0}% of fleet`}
              isLoading={isLoading}
            />
            <KpiTile
              label="Paused / Disabled"
              icon={Pause}
              tone={paused.length + disabled.length > 0 ? "warning" : "default"}
              value={paused.length + disabled.length}
              hint={`${paused.length} paused · ${disabled.length} disabled`}
              isLoading={isLoading}
            />
            <KpiTile
              label="Avg backup size"
              icon={Sparkles}
              value={avgSize > 0 ? formatBytes(avgSize) : "—"}
              hint={recentRun ? `last run ${formatDistanceToNow(new Date(recentRun.timestamp), { addSuffix: true })}` : "No runs yet"}
              isLoading={isLoading}
            />
          </div>
        </section>

        {/* Snapshot grid */}
        <section className="space-y-4">
          <SectionRule label="02 · Posture" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <Card className="lg:col-span-5 p-0 overflow-hidden">
              <div className="border-b border-hairline-soft p-6 lg:p-8">
                <Eyebrow>Fleet posture</Eyebrow>
                <p className="text-heading-sm text-on-primary mt-1">Active / paused / disabled</p>
              </div>
              <div className="p-6 lg:p-8 space-y-6">
                {isLoading ? (
                  <Skeleton className="size-40 rounded-full mx-auto" />
                ) : (
                  <PostureDonut
                    active={active.length}
                    paused={paused.length}
                    disabled={disabled.length}
                  />
                )}
                <div className="grid grid-cols-3 gap-3 pt-4 border-t border-hairline-soft">
                  <PostureLegend color="bg-success" label="Active" count={active.length} />
                  <PostureLegend color="bg-amber-400" label="Paused" count={paused.length} />
                  <PostureLegend color="bg-mute" label="Disabled" count={disabled.length} />
                </div>
              </div>
            </Card>

            <Card className="lg:col-span-7 p-0 overflow-hidden">
              <div className="border-b border-hairline-soft p-6 lg:p-8 flex items-start justify-between gap-4">
                <div>
                  <Eyebrow>Schedule cadence</Eyebrow>
                  <p className="text-heading-sm text-on-primary mt-1">Cron pattern distribution</p>
                </div>
                <Badge variant="mono">
                  <CalendarClock className="size-2.5" /> Parsed
                </Badge>
              </div>
              <div className="p-6 lg:p-8">
                {isLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : list.length === 0 ? (
                  <div className="text-center py-6 space-y-2">
                    <CalendarClock className="size-7 mx-auto text-ash" />
                    <p className="text-caption text-ash">
                      Add a database to populate the schedule histogram.
                    </p>
                  </div>
                ) : (
                  <ScheduleDistribution databases={list} />
                )}
              </div>
            </Card>
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="border-b border-hairline-soft p-6 lg:p-8 flex items-start justify-between gap-4">
              <div>
                <Eyebrow>Largest databases</Eyebrow>
                <p className="text-heading-sm text-on-primary mt-1">By total bytes archived</p>
              </div>
              {recentRun?.status === "failed" && (
                <Badge variant="error">
                  <XCircle className="size-2.5" /> Latest failed
                </Badge>
              )}
              {recentRun?.status === "success" && (
                <Badge variant="success">
                  <Zap className="size-2.5" /> Latest success
                </Badge>
              )}
            </div>
            <div className="p-6 lg:p-8">
              {isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <TopStoragePanel databases={list} backups={backups ?? []} />
              )}
            </div>
          </Card>
        </section>

        {/* Existing roster */}
        <section className="space-y-4">
          <SectionRule label="03 · Roster" />
          <DatabaseList />
        </section>
      </div>
    </AppLayout>
  );
}

function PostureLegend({
  color,
  label,
  count,
}: {
  color: string;
  label: string;
  count: number;
}) {
  return (
    <div className="space-y-1">
      <span className={cn("inline-block size-2 rounded-full", color)} />
      <p className="text-heading-sm tabular-nums text-on-primary">{count}</p>
      <p className="text-mono-caps uppercase text-mute">{label}</p>
    </div>
  );
}
