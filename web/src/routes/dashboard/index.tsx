import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useActivityLogs } from "@/lib/api/logs";
import { useSystemStats } from "@/lib/api/stats";
import { useStorageConfigs } from "@/lib/api/storage";
import type {
  ActivityLog,
  Backup,
  DatabaseConfig,
  StorageConfig,
} from "@/lib/types/api";
import {
  formatBytes,
  formatPercentage,
  parseCronExpression,
} from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Database,
  HardDrive,
  Loader2,
  Pause,
  Plus,
  RefreshCw,
  Server,
  Sparkles,
  XCircle,
  Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useMemo } from "react";

export const Route = createFileRoute("/dashboard/")({
  component: OverviewPage,
  head: () => ({
    meta: [
      { title: "Dashboard - DumpStation" },
      {
        name: "description",
        content:
          "Monitor and manage your PostgreSQL database backups. View backup status, storage usage, and system health in real-time.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Dashboard - DumpStation" },
      {
        property: "og:description",
        content:
          "Monitor and manage your PostgreSQL database backups in real-time.",
      },
      {
        property: "og:url",
        content: "https://dumpstation.monzim.com/dashboard",
      },
      { name: "twitter:title", content: "Dashboard - DumpStation" },
      {
        name: "twitter:description",
        content:
          "Monitor and manage your PostgreSQL database backups in real-time.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://dumpstation.monzim.com/dashboard",
      },
    ],
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Derived metrics & helpers
// ─────────────────────────────────────────────────────────────────────────────

type DayCell = {
  date: Date;
  total: number;
  success: number;
  failed: number;
  running: number;
};

type HourCell = {
  hour: Date;
  total: number;
  success: number;
  failed: number;
};

function startOfHourLocal(d: Date) {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  return x;
}

function startOfDayLocal(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function buildHourSeries(backups: Backup[] | undefined, hours = 24): HourCell[] {
  const now = new Date();
  const seriesStart = startOfHourLocal(new Date(now.getTime() - (hours - 1) * 3600_000));
  const cells: HourCell[] = Array.from({ length: hours }, (_, i) => ({
    hour: new Date(seriesStart.getTime() + i * 3600_000),
    total: 0,
    success: 0,
    failed: 0,
  }));
  if (!backups) return cells;
  for (const b of backups) {
    const t = new Date(b.timestamp).getTime();
    const diffHrs = Math.floor((startOfHourLocal(new Date(t)).getTime() - seriesStart.getTime()) / 3600_000);
    if (diffHrs < 0 || diffHrs >= hours) continue;
    const cell = cells[diffHrs];
    cell.total += 1;
    if (b.status === "success") cell.success += 1;
    else if (b.status === "failed") cell.failed += 1;
  }
  return cells;
}

function buildDaySeries(backups: Backup[] | undefined, days = 14): DayCell[] {
  const today = startOfDayLocal(new Date());
  const seriesStart = new Date(today.getTime() - (days - 1) * 86_400_000);
  const cells: DayCell[] = Array.from({ length: days }, (_, i) => ({
    date: new Date(seriesStart.getTime() + i * 86_400_000),
    total: 0,
    success: 0,
    failed: 0,
    running: 0,
  }));
  if (!backups) return cells;
  for (const b of backups) {
    const t = startOfDayLocal(new Date(b.timestamp)).getTime();
    const diffDays = Math.floor((t - seriesStart.getTime()) / 86_400_000);
    if (diffDays < 0 || diffDays >= days) continue;
    const cell = cells[diffDays];
    cell.total += 1;
    if (b.status === "success") cell.success += 1;
    else if (b.status === "failed") cell.failed += 1;
    else cell.running += 1;
  }
  return cells;
}

// ─────────────────────────────────────────────────────────────────────────────
// LEAD CARD — the headline success-rate statement with 24h sparkbar
// ─────────────────────────────────────────────────────────────────────────────

function LeadCard({
  rate,
  totalRuns,
  failures,
  inFlight,
  hourSeries,
  isLoading,
}: {
  rate: number;
  totalRuns: number;
  failures: number;
  inFlight: number;
  hourSeries: HourCell[];
  isLoading: boolean;
}) {
  const tone = rate >= 95 ? "success" : rate >= 80 ? "warning" : "danger";
  const valueClass =
    tone === "success" ? "text-on-primary" : tone === "warning" ? "text-amber-400" : "text-error";

  const max = Math.max(1, ...hourSeries.map((h) => h.total));

  return (
    <Card className="lg:col-span-7 relative overflow-hidden p-0">
      {/* subtle decorative grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="relative p-6 lg:p-8 flex flex-col gap-6 h-full">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Eyebrow>The Lead · Success rate · 24h</Eyebrow>
            <p className="text-caption text-ash max-w-xs">
              Share of backup runs that completed cleanly in the last twenty-four hours.
            </p>
          </div>
          <Badge variant={tone === "success" ? "success" : tone === "warning" ? "warning" : "error"}>
            <LiveDot tone={tone} /> {tone === "success" ? "Healthy" : tone === "warning" ? "Watch" : "Critical"}
          </Badge>
        </div>

        {isLoading ? (
          <Skeleton className="h-[88px] w-48" />
        ) : (
          <div className="flex items-baseline gap-3">
            <span className={cn("text-display-xl tabular-nums", valueClass)} style={{ fontFeatureSettings: "'tnum' 1" }}>
              {formatPercentage(rate)}
            </span>
            <span className="text-mono-caps uppercase text-mute">
              {totalRuns} runs
            </span>
          </div>
        )}

        {/* 24-hour pulse bar */}
        <div className="space-y-2">
          <div className="flex items-end justify-between gap-px h-16">
            {hourSeries.map((h, i) => {
              const heightPct = (h.total / max) * 100;
              const isNow = i === hourSeries.length - 1;
              return (
                <div key={i} className="group flex-1 flex flex-col justify-end items-stretch h-full relative">
                  {h.total > 0 ? (
                    <div className="flex flex-col-reverse h-full">
                      <div
                        className={cn("bg-success/80 group-hover:bg-success transition-colors")}
                        style={{ height: `${(h.success / h.total) * heightPct}%`, minHeight: h.success ? "2px" : 0 }}
                      />
                      <div
                        className="bg-error/80 group-hover:bg-error transition-colors"
                        style={{ height: `${(h.failed / h.total) * heightPct}%`, minHeight: h.failed ? "2px" : 0 }}
                      />
                    </div>
                  ) : (
                    <div className="h-px bg-graphite/60" />
                  )}
                  {isNow && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 h-2 w-px bg-on-primary/40" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-mono-micro text-mute uppercase">
            <span>−24h</span>
            <span className="hidden xxs:inline">−18h</span>
            <span>−12h</span>
            <span className="hidden xxs:inline">−6h</span>
            <span className="text-ash">now</span>
          </div>
        </div>

        {/* footer ledger */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-hairline-soft">
          <FootMetric label="Completed" value={totalRuns - failures - inFlight} tone="success" />
          <FootMetric label="Failed" value={failures} tone={failures > 0 ? "danger" : "default"} />
          <FootMetric label="In flight" value={inFlight} tone={inFlight > 0 ? "info" : "default"} spinning={inFlight > 0} />
        </div>
      </div>
    </Card>
  );
}

function FootMetric({
  label,
  value,
  tone,
  spinning,
}: {
  label: string;
  value: number;
  tone: "default" | "success" | "danger" | "info";
  spinning?: boolean;
}) {
  const valueClass =
    tone === "success"
      ? "text-success"
      : tone === "danger"
        ? "text-error"
        : tone === "info"
          ? "text-link-blue-soft"
          : "text-on-primary";
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-mono-caps uppercase text-mute">
        {spinning && <Loader2 className="size-3 animate-spin text-link-blue-soft" />}
        {label}
      </div>
      <p className={cn("text-heading-sm tabular-nums", valueClass)}>{value}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PULSE CARD — 24h backups-per-hour heatmap-bar visualization
// ─────────────────────────────────────────────────────────────────────────────

function PulseCard({
  hourSeries,
  isLoading,
}: {
  hourSeries: HourCell[];
  isLoading: boolean;
}) {
  const total = hourSeries.reduce((acc, h) => acc + h.total, 0);
  const peak = hourSeries.reduce<{ count: number; hour: number }>(
    (acc, h) => (h.total > acc.count ? { count: h.total, hour: h.hour.getHours() } : acc),
    { count: 0, hour: 0 },
  );
  const activeHours = hourSeries.filter((h) => h.total > 0).length;

  return (
    <Card className="lg:col-span-5 p-0 overflow-hidden">
      <div className="p-6 lg:p-8 flex flex-col gap-6 h-full">
        <div className="space-y-2">
          <Eyebrow>Operational pulse · last 24h</Eyebrow>
          <p className="text-caption text-ash">
            Backup runs by the hour. Each cell = one hour, intensity = run count.
          </p>
        </div>

        {/* heatmap row */}
        <div className="space-y-3">
          {isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <div className="grid gap-px" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
              {hourSeries.map((h, i) => {
                const intensity =
                  h.total === 0 ? 0 : Math.min(1, h.total / Math.max(1, peak.count));
                const failed = h.failed > 0;
                const bg = failed
                  ? `rgba(221, 0, 0, ${0.25 + intensity * 0.75})`
                  : h.total > 0
                    ? `rgba(55, 205, 132, ${0.18 + intensity * 0.7})`
                    : "transparent";
                return (
                  <div
                    key={i}
                    title={`${h.hour.getHours().toString().padStart(2, "0")}:00 — ${h.total} run${h.total === 1 ? "" : "s"}${failed ? `, ${h.failed} failed` : ""}`}
                    className="h-12 border border-graphite/60 rounded-[1px] transition-transform hover:scale-110 hover:z-10"
                    style={{ background: bg }}
                  />
                );
              })}
            </div>
          )}
          <div className="flex justify-between text-mono-micro text-mute uppercase">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-hairline-soft mt-auto">
          <FootMetric label="Total runs" value={total} tone="default" />
          <FootMetric label="Active hrs" value={activeHours} tone="default" />
          <FootMetric label={`Peak ${peak.hour.toString().padStart(2, "0")}:00`} value={peak.count} tone="default" />
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTENTION CARD — failed backups OR all-clear hero
// ─────────────────────────────────────────────────────────────────────────────

function AttentionCard({
  failed,
  databaseMap,
  isLoading,
}: {
  failed: Backup[];
  databaseMap: Map<string, DatabaseConfig>;
  isLoading: boolean;
}) {
  const shown = failed.slice(0, 4);
  return (
    <Card className="lg:col-span-8 p-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-hairline-soft p-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "size-9 rounded-app-sm border flex items-center justify-center",
              failed.length > 0
                ? "border-error/40 bg-error/10 text-error"
                : "border-success/40 bg-success/10 text-success",
            )}
          >
            {failed.length > 0 ? (
              <AlertTriangle className="size-4" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
          </div>
          <div>
            <Eyebrow>Attention zone</Eyebrow>
            <p className="text-heading-sm text-on-primary mt-0.5">
              {failed.length > 0
                ? `${failed.length} backup${failed.length === 1 ? "" : "s"} failed`
                : "All systems green"}
            </p>
          </div>
        </div>
        {failed.length > 0 ? (
          <Button variant="ghost-dark" size="sm" asChild>
            <Link to="/backups">
              Triage <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        ) : (
          <Badge variant="success">
            <LiveDot /> Operational
          </Badge>
        )}
      </div>

      <div className="p-6 lg:p-8 space-y-3">
        {isLoading ? (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3 p-3 rounded-app-md bg-canvas-soft border border-hairline-soft">
                <Skeleton className="size-4 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </>
        ) : failed.length === 0 ? (
          <div className="rounded-app-md border border-dashed border-hairline-soft p-6 text-center space-y-2">
            <Sparkles className="size-6 text-success mx-auto" />
            <p className="text-body-sm text-on-primary">
              No failed backups in the last cycle.
            </p>
            <p className="text-caption text-ash">
              When something breaks, the broken runs will surface here with the diagnostic line your script emitted.
            </p>
          </div>
        ) : (
          <>
            {shown.map((b) => {
              const db = databaseMap.get(b.database_id);
              return (
                <div
                  key={b.id}
                  className="group flex items-start gap-4 p-4 rounded-app-md bg-canvas-soft border border-hairline-soft hover:border-error/40 transition-colors"
                >
                  <span className="size-2 rounded-full bg-error mt-2 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-body-sm font-medium text-on-primary truncate">
                        {db?.name ?? "Unknown database"}
                      </p>
                      <span className="text-mono-micro uppercase text-mute">
                        {db?.host}:{db?.port}
                      </span>
                      <Badge variant="error">Failed</Badge>
                    </div>
                    <p className="text-caption text-ash line-clamp-2 font-mono">
                      {b.error_message ?? "No diagnostic message attached."}
                    </p>
                    <p className="text-mono-micro uppercase text-mute">
                      {formatDistanceToNow(new Date(b.timestamp), { addSuffix: true })}
                    </p>
                  </div>
                  <ArrowUpRight className="size-4 text-mute group-hover:text-on-primary transition-colors" />
                </div>
              );
            })}
            {failed.length > shown.length && (
              <Button variant="ghost-dark" className="w-full" asChild>
                <Link to="/backups">
                  Open {failed.length - shown.length} more in backups
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FLEET PULSE — compact health donut + breakdown
// ─────────────────────────────────────────────────────────────────────────────

function FleetPulseCard({
  active,
  paused,
  disabled,
  failed,
  inFlight,
  totalBackups,
  isLoading,
}: {
  active: number;
  paused: number;
  disabled: number;
  failed: number;
  inFlight: number;
  totalBackups: number;
  isLoading: boolean;
}) {
  const fleetTotal = active + paused + disabled;
  const safeTotal = Math.max(1, fleetTotal);
  const activePct = (active / safeTotal) * 100;
  const pausedPct = (paused / safeTotal) * 100;
  const disabledPct = (disabled / safeTotal) * 100;

  // donut circumference math for SVG ring
  const R = 56;
  const C = 2 * Math.PI * R;
  const activeArc = (activePct / 100) * C;
  const pausedArc = (pausedPct / 100) * C;
  const disabledArc = (disabledPct / 100) * C;

  return (
    <Card className="lg:col-span-4 p-0">
      <div className="border-b border-hairline-soft p-6 lg:px-8">
        <Eyebrow>Fleet pulse</Eyebrow>
        <p className="text-heading-sm text-on-primary mt-1">Posture across all databases</p>
      </div>
      <div className="p-6 lg:p-8 flex flex-col gap-6">
        {isLoading ? (
          <Skeleton className="size-40 rounded-full mx-auto" />
        ) : (
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
                  strokeLinecap="butt"
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
                  strokeLinecap="butt"
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
                  strokeLinecap="butt"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-display-sm tabular-nums text-on-primary">{fleetTotal}</span>
                <span className="text-mono-caps uppercase text-mute">databases</span>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2 text-caption">
          <LegendRow color="bg-success" label="Active" value={active} pct={activePct} />
          <LegendRow color="bg-amber-400" label="Paused" value={paused} pct={pausedPct} />
          <LegendRow color="bg-mute" label="Disabled" value={disabled} pct={disabledPct} />
        </div>

        <div className="grid grid-cols-3 gap-3 pt-4 border-t border-hairline-soft text-mono-caps uppercase text-mute">
          <div>
            <p className="text-on-primary text-heading-sm tabular-nums">{totalBackups}</p>
            <p>24h runs</p>
          </div>
          <div>
            <p className={cn("text-heading-sm tabular-nums", failed > 0 ? "text-error" : "text-on-primary")}>
              {failed}
            </p>
            <p>Failed</p>
          </div>
          <div>
            <p className={cn("text-heading-sm tabular-nums", inFlight > 0 ? "text-link-blue-soft" : "text-on-primary")}>
              {inFlight}
            </p>
            <p>In flight</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function LegendRow({
  color,
  label,
  value,
  pct,
}: {
  color: string;
  label: string;
  value: number;
  pct: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn("size-2 rounded-full", color)} />
      <span className="text-ash flex-1">{label}</span>
      <span className="text-mono-caps uppercase text-mute tabular-nums">
        {value} · {pct.toFixed(0)}%
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FLEET TABLE — 14-day backup strip per database
// ─────────────────────────────────────────────────────────────────────────────

function DatabaseFleetTable({
  databases,
  backups,
  isLoading,
}: {
  databases: DatabaseConfig[];
  backups: Backup[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card className="p-0 overflow-hidden">
        <div className="p-6 border-b border-hairline-soft">
          <Eyebrow>Database fleet</Eyebrow>
          <p className="text-heading-sm text-on-primary mt-1">14-day backup health per database</p>
        </div>
        <div className="p-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-app-md" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between p-6 lg:p-8 border-b border-hairline-soft">
        <div>
          <Eyebrow>Database fleet</Eyebrow>
          <p className="text-heading-sm text-on-primary mt-1">14-day backup health per database</p>
        </div>
        <Button variant="ghost-dark" size="sm" asChild>
          <Link to="/databases">
            Manage <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>

      {databases.length === 0 ? (
        <div className="p-10 text-center space-y-4">
          <Database className="size-10 mx-auto text-ash" />
          <div className="space-y-1">
            <p className="text-heading-sm text-on-primary">No databases configured</p>
            <p className="text-caption text-ash">Add your first PostgreSQL database to start monitoring.</p>
          </div>
          <Button variant="primary" size="lg" asChild>
            <Link to="/databases">
              <Plus className="size-4" />
              Add database
            </Link>
          </Button>
        </div>
      ) : (
        <>
          {/* desktop column header (hidden on small) */}
          <div className="hidden lg:grid grid-cols-[1.5fr_1fr_1.2fr_1.5fr_0.8fr_0.7fr] gap-4 px-8 py-3 border-b border-hairline-soft text-mono-micro uppercase text-mute">
            <span>Database</span>
            <span>Schedule</span>
            <span>Last backup</span>
            <span>14-day strip</span>
            <span className="text-right">Size</span>
            <span className="text-right">State</span>
          </div>

          <div>
            {databases.map((db) => (
              <FleetRow key={db.id} database={db} backups={backups} />
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function FleetRow({ database, backups }: { database: DatabaseConfig; backups: Backup[] }) {
  const dbBackups = useMemo(
    () => backups.filter((b) => b.database_id === database.id),
    [backups, database.id],
  );
  const days = useMemo(() => buildDaySeries(dbBackups, 14), [dbBackups]);
  const last = dbBackups
    .slice()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  const lastSize = last?.size_bytes;

  const stateLabel = !database.enabled ? "Disabled" : database.paused ? "Paused" : "Active";
  const stateBadge: "success" | "warning" | "mono" = !database.enabled
    ? "mono"
    : database.paused
      ? "warning"
      : "success";

  return (
    <div className="grid lg:grid-cols-[1.5fr_1fr_1.2fr_1.5fr_0.8fr_0.7fr] gap-4 px-6 lg:px-8 py-5 border-b border-hairline-soft last:border-0 items-center hover:bg-canvas-soft/40 transition-colors">
      {/* Database name + host */}
      <div className="min-w-0 flex items-center gap-3">
        <div className="size-8 rounded-app-sm bg-canvas-soft border border-hairline-soft flex items-center justify-center shrink-0">
          <Database className="size-4 text-ash" />
        </div>
        <div className="min-w-0">
          <p className="text-body-sm font-medium text-on-primary truncate">{database.name}</p>
          <p className="text-mono-micro uppercase text-mute truncate">
            {database.host}:{database.port} · {database.dbname}
          </p>
        </div>
      </div>

      {/* Schedule */}
      <div className="hidden lg:block min-w-0">
        <p className="text-caption text-ash truncate">{parseCronExpression(database.schedule)}</p>
        <p className="text-mono-micro uppercase text-mute font-mono">{database.schedule}</p>
      </div>

      {/* Last backup */}
      <div className="hidden lg:block min-w-0">
        {last ? (
          <>
            <p className="text-caption text-on-primary">
              {formatDistanceToNow(new Date(last.timestamp), { addSuffix: true })}
            </p>
            <p
              className={cn(
                "text-mono-micro uppercase",
                last.status === "success"
                  ? "text-success"
                  : last.status === "failed"
                    ? "text-error"
                    : "text-link-blue-soft",
              )}
            >
              {last.status}
            </p>
          </>
        ) : (
          <p className="text-caption text-mute italic">No runs yet</p>
        )}
      </div>

      {/* 14-day strip */}
      <div className="flex items-center gap-px h-7">
        {days.map((d, i) => {
          const cls =
            d.total === 0
              ? "bg-graphite/50"
              : d.failed > 0
                ? "bg-error/80"
                : d.success > 0
                  ? "bg-success/70"
                  : "bg-link-blue-soft/70";
          return (
            <div
              key={i}
              title={`${d.date.toDateString()} · ${d.total} run${d.total === 1 ? "" : "s"}`}
              className={cn("flex-1 h-full rounded-[1px]", cls)}
            />
          );
        })}
      </div>

      {/* Size */}
      <div className="hidden lg:block text-right text-caption tabular-nums text-ash">
        {lastSize ? formatBytes(lastSize) : "—"}
      </div>

      {/* State */}
      <div className="flex lg:justify-end justify-start">
        <Badge variant={stateBadge}>
          {database.paused && <Pause className="size-2.5" />}
          {!database.enabled && <XCircle className="size-2.5" />}
          {stateLabel}
        </Badge>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RECENT ACTIVITY feed
// ─────────────────────────────────────────────────────────────────────────────

const activityIconMap: Record<
  ActivityLog["level"],
  { Icon: React.ElementType; tone: string }
> = {
  info: { Icon: AlertCircle, tone: "text-link-blue-soft" },
  success: { Icon: CheckCircle2, tone: "text-success" },
  warning: { Icon: AlertTriangle, tone: "text-amber-400" },
  error: { Icon: XCircle, tone: "text-error" },
};

const actionLabels: Record<string, string> = {
  backup_completed: "Backup completed",
  backup_failed: "Backup failed",
  backup_triggered: "Backup triggered",
  backup_started: "Backup started",
  database_created: "Database added",
  database_updated: "Database updated",
  database_deleted: "Database removed",
  database_paused: "Database paused",
  database_unpaused: "Database resumed",
  storage_created: "Storage configured",
  storage_updated: "Storage updated",
  storage_deleted: "Storage removed",
  notification_created: "Notification added",
  login: "User signed in",
  logout: "User signed out",
  restore_triggered: "Restore initiated",
  restore_completed: "Restore completed",
  restore_failed: "Restore failed",
};

function ActivityFeed({
  logs,
  isLoading,
}: {
  logs: ActivityLog[];
  isLoading: boolean;
}) {
  return (
    <Card className="lg:col-span-8 p-0 overflow-hidden">
      <div className="flex items-center justify-between p-6 lg:px-8 border-b border-hairline-soft">
        <div>
          <Eyebrow>Recent activity</Eyebrow>
          <p className="text-heading-sm text-on-primary mt-1">System & operator events</p>
        </div>
        <Button variant="ghost-dark" size="sm" asChild>
          <Link to="/activity">
            Full log <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>

      <div className="p-2">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Clock className="size-8 text-ash mx-auto" />
            <p className="text-body-sm text-on-primary">No recent activity</p>
            <p className="text-caption text-ash">Events will appear here as they happen.</p>
          </div>
        ) : (
          <ol className="relative">
            {logs.map((log, i) => {
              const { Icon, tone } = activityIconMap[log.level];
              const isLast = i === logs.length - 1;
              return (
                <li key={log.id} className="group relative flex gap-4 px-4 lg:px-6 py-3 hover:bg-canvas-soft/40 transition-colors">
                  {/* spine line */}
                  {!isLast && (
                    <span
                      aria-hidden
                      className="absolute left-[35px] lg:left-[43px] top-9 bottom-0 w-px bg-hairline-soft"
                    />
                  )}
                  <div className="relative shrink-0 size-7 rounded-app-sm bg-canvas-soft border border-hairline-soft flex items-center justify-center">
                    <Icon className={cn("size-3.5", tone)} />
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-3 justify-between">
                    <div className="min-w-0">
                      <p className="text-body-sm text-on-primary truncate">
                        {actionLabels[log.action] ?? log.action.replace(/_/g, " ")}
                      </p>
                      <p className="text-caption text-ash truncate">
                        {log.entity_name || log.description}
                      </p>
                    </div>
                    <span className="text-mono-micro uppercase text-mute shrink-0">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE DISTRIBUTION — bars per storage config
// ─────────────────────────────────────────────────────────────────────────────

function StorageDistributionCard({
  storages,
  databases,
  backups,
  totalBytes,
  isLoading,
}: {
  storages: StorageConfig[];
  databases: DatabaseConfig[];
  backups: Backup[];
  totalBytes: number;
  isLoading: boolean;
}) {
  const breakdown = useMemo(() => {
    if (!storages.length) return [];
    const dbToStorage = new Map<string, string>(
      databases.map((d) => [d.id, d.storage_id]),
    );
    const totals = new Map<string, { bytes: number; count: number }>();
    for (const s of storages) totals.set(s.id, { bytes: 0, count: 0 });
    for (const b of backups) {
      if (b.status !== "success" || !b.size_bytes) continue;
      const sid = dbToStorage.get(b.database_id);
      if (!sid) continue;
      const cur = totals.get(sid);
      if (!cur) continue;
      cur.bytes += b.size_bytes;
      cur.count += 1;
    }
    return storages.map((s) => ({
      storage: s,
      bytes: totals.get(s.id)?.bytes ?? 0,
      count: totals.get(s.id)?.count ?? 0,
    }));
  }, [storages, databases, backups]);

  const maxBytes = Math.max(1, ...breakdown.map((b) => b.bytes));

  return (
    <Card className="lg:col-span-4 p-0">
      <div className="p-6 lg:px-8 border-b border-hairline-soft">
        <Eyebrow>Storage distribution</Eyebrow>
        <p className="text-heading-sm text-on-primary mt-1">By bucket</p>
      </div>
      <div className="p-6 lg:p-8 space-y-5">
        {isLoading ? (
          <>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </>
        ) : breakdown.length === 0 ? (
          <div className="text-center space-y-2 py-6">
            <HardDrive className="size-8 mx-auto text-ash" />
            <p className="text-body-sm text-on-primary">No storage configured</p>
            <p className="text-caption text-ash">
              Connect S3 or R2 to begin tracking distribution.
            </p>
            <Button variant="secondary-dark" size="sm" asChild className="mt-2">
              <Link to="/storage">Configure storage</Link>
            </Button>
          </div>
        ) : (
          <>
            {breakdown.map(({ storage, bytes, count }) => {
              const pct = (bytes / maxBytes) * 100;
              const totalPct = totalBytes > 0 ? (bytes / totalBytes) * 100 : 0;
              return (
                <div key={storage.id} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body-sm text-on-primary truncate">{storage.name}</p>
                      <p className="text-mono-micro uppercase text-mute truncate">
                        {storage.provider.toUpperCase()} · {storage.bucket}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-caption tabular-nums text-on-primary">{formatBytes(bytes)}</p>
                      <p className="text-mono-micro uppercase text-mute">
                        {count} obj · {totalPct.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-graphite/60 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-700",
                        storage.provider === "r2" ? "bg-link-blue-soft" : "bg-brand",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────

function OverviewPage() {
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    refetch,
    isRefetching,
    dataUpdatedAt,
  } = useSystemStats();
  const { data: backups, isLoading: backupsLoading } = useBackups();
  const { data: databases, isLoading: databasesLoading } = useDatabases();
  const { data: storagesData, isLoading: storagesLoading } = useStorageConfigs();
  const { data: activityData, isLoading: activityLoading } = useActivityLogs({
    limit: 8,
  });

  const now = useNow();

  const handleRefresh = () => refetch();

  const isLoading = statsLoading || backupsLoading || databasesLoading;

  // 24h slice
  const last24hStart = useMemo(() => new Date(Date.now() - 24 * 3600_000), []);
  const backups24h = useMemo(
    () => (backups ?? []).filter((b) => new Date(b.timestamp).getTime() >= last24hStart.getTime()),
    [backups, last24hStart],
  );
  const hourSeries = useMemo(() => buildHourSeries(backups24h, 24), [backups24h]);

  const failed = useMemo(
    () => (backups ?? []).filter((b) => b.status === "failed"),
    [backups],
  );
  const failed24h = useMemo(
    () => backups24h.filter((b) => b.status === "failed"),
    [backups24h],
  );
  const inFlight = useMemo(
    () =>
      (backups ?? []).filter((b) => b.status === "pending" || b.status === "running"),
    [backups],
  );

  const databasesList = databases ?? [];
  const activeDbs = databasesList.filter((d) => d.enabled && !d.paused);
  const pausedDbs = databasesList.filter((d) => d.paused);
  const disabledDbs = databasesList.filter((d) => !d.enabled);

  const databaseMap = useMemo(
    () => new Map(databasesList.map((d) => [d.id, d])),
    [databasesList],
  );

  const successRate = stats?.success_rate_24h ?? 0;
  const totalRuns24h = stats?.total_backups_24h ?? backups24h.length;
  const totalStorageBytes = stats?.total_storage_used_bytes ?? 0;

  // estimate next backup ETA from last backup time + schedule (best-effort; if unavailable, omit)
  const lastBackupRelative = useMemo(() => {
    if (!backups || backups.length === 0) return null;
    const latest = backups
      .slice()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    return latest;
  }, [backups]);

  if (statsError) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4 max-w-sm">
          <AlertCircle className="size-10 text-error mx-auto" />
          <div className="space-y-2">
            <Eyebrow>System</Eyebrow>
            <h1 className="text-heading-sm text-on-primary">Unable to load dashboard</h1>
            <p className="text-caption text-ash">
              {(statsError as { message?: string }).message ||
                "Failed to connect to the server"}
            </p>
          </div>
          <Button onClick={handleRefresh} variant="secondary-dark">
            <RefreshCw className="size-4" />
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const lastSyncSec =
    dataUpdatedAt > 0 ? Math.max(0, Math.floor((now.getTime() - dataUpdatedAt) / 1000)) : null;
  const lastSyncLabel =
    lastSyncSec === null
      ? "—"
      : lastSyncSec < 60
        ? `${lastSyncSec}s ago`
        : `${Math.floor(lastSyncSec / 60)}m ago`;

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <PageBriefing
        eyebrow={`Console · Node status · ${now.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}`}
        title="Operations"
        echo="console."
        subtitle="At-a-glance health for every database, every bucket, every dump in flight."
        ledger={[
          {
            label: "Live",
            value: (
              <span className="inline-flex items-center gap-2">
                <LiveDot
                  tone={
                    failed24h.length === 0
                      ? "success"
                      : failed24h.length < 3
                        ? "warning"
                        : "danger"
                  }
                />
                {now.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                })}
              </span>
            ),
          },
          { label: "Sync", value: lastSyncLabel },
          { label: "Fleet", value: `${activeDbs.length}/${databasesList.length}` },
        ]}
        actions={
          <>
            <Button variant="secondary-dark" onClick={handleRefresh} disabled={isRefetching}>
              <RefreshCw className={cn("size-4", isRefetching && "animate-spin")} />
              Refresh
            </Button>
            <Button variant="primary" size="default" asChild>
              <Link to="/databases">
                <Plus className="size-4" />
                New database
              </Link>
            </Button>
          </>
        }
      />

      {/* ─────────────────  LEAD + PULSE  ───────────────── */}
      <section className="space-y-4">
        <SectionRule label="01 · Topline" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <LeadCard
            rate={successRate}
            totalRuns={totalRuns24h}
            failures={failed24h.length}
            inFlight={inFlight.length}
            hourSeries={hourSeries}
            isLoading={isLoading}
          />
          <PulseCard hourSeries={hourSeries} isLoading={isLoading} />
        </div>
      </section>

      {/* ─────────────────────────  KPI STRIP  ───────────────────────── */}
      <section className="space-y-4">
        <SectionRule label="02 · Indicators" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiTile
            label="Total databases"
            icon={Database}
            value={databasesList.length}
            hint={`${activeDbs.length} active · ${pausedDbs.length} paused`}
            isLoading={isLoading}
          />
          <KpiTile
            label="Backups · 24h"
            icon={Archive}
            value={totalRuns24h}
            hint={`${failed24h.length} failed · ${inFlight.length} live`}
            tone={failed24h.length > 0 ? "warning" : "default"}
            isLoading={isLoading}
          />
          <KpiTile
            label="Storage used"
            icon={HardDrive}
            value={formatBytes(totalStorageBytes)}
            hint={`across ${(storagesData ?? []).length || 0} bucket${(storagesData ?? []).length === 1 ? "" : "s"}`}
            isLoading={isLoading || storagesLoading}
          />
          <KpiTile
            label="Latest run"
            icon={Zap}
            tone={
              lastBackupRelative?.status === "failed"
                ? "danger"
                : lastBackupRelative?.status === "success"
                  ? "success"
                  : "info"
            }
            value={
              lastBackupRelative
                ? formatDistanceToNow(new Date(lastBackupRelative.timestamp), {
                    addSuffix: false,
                  })
                : "—"
            }
            hint={
              lastBackupRelative
                ? `${(databaseMap.get(lastBackupRelative.database_id)?.name ?? "unknown").slice(0, 24)} · ${lastBackupRelative.status}`
                : "No runs recorded"
            }
            isLoading={isLoading}
          />
        </div>
      </section>

      {/* ─────────────────────  ATTENTION + FLEET PULSE  ───────────────────── */}
      <section className="space-y-4">
        <SectionRule label="03 · Watchpoints" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <AttentionCard failed={failed} databaseMap={databaseMap} isLoading={isLoading} />
          <FleetPulseCard
            active={activeDbs.length}
            paused={pausedDbs.length}
            disabled={disabledDbs.length}
            failed={failed24h.length}
            inFlight={inFlight.length}
            totalBackups={totalRuns24h}
            isLoading={isLoading}
          />
        </div>
      </section>

      {/* ─────────────────────  DATABASE FLEET TABLE  ───────────────────── */}
      <section className="space-y-4">
        <SectionRule label="04 · Fleet" />
        <DatabaseFleetTable
          databases={databasesList}
          backups={backups ?? []}
          isLoading={isLoading}
        />
      </section>

      {/* ─────────────────────  ACTIVITY + STORAGE DIST  ───────────────────── */}
      <section className="space-y-4">
        <SectionRule label="05 · Telemetry" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <ActivityFeed logs={activityData?.logs ?? []} isLoading={activityLoading} />
          <StorageDistributionCard
            storages={storagesData ?? []}
            databases={databasesList}
            backups={backups ?? []}
            totalBytes={totalStorageBytes}
            isLoading={storagesLoading || isLoading}
          />
        </div>
      </section>

      {/* ─────────────────────  FOOTER MICROCOPY  ───────────────────── */}
      <section>
        <div className="border-t border-hairline-soft pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-mono-caps uppercase text-mute">
            End of briefing · auto-refresh every 30s
          </p>
          <div className="flex items-center gap-4">
            <Link to="/activity" className="text-mono-caps uppercase text-ash hover:text-on-primary inline-flex items-center gap-1.5">
              <Activity className="size-3" /> Full activity log
            </Link>
            <Link to="/db-servers" className="text-mono-caps uppercase text-ash hover:text-on-primary inline-flex items-center gap-1.5">
              <Server className="size-3" /> Servers
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
