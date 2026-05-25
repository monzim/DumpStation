import { AppLayout } from "@/components/app-layout";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/eyebrow";
import { LiveDot, useNow } from "@/components/ui/page-briefing";
import { useBackups } from "@/lib/api/backups";
import { useDatabases } from "@/lib/api/databases";
import { useDbServers } from "@/lib/api/db-servers";
import { useActivityLogs } from "@/lib/api/logs";
import { useSystemStats } from "@/lib/api/stats";
import { useStorageConfigs } from "@/lib/api/storage";
import type {
  ActivityLog,
  Backup,
  DatabaseConfig,
  ServerConnection,
  StorageConfig,
} from "@/lib/types/api";
import { formatBytes, formatPercentage } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { apiClient } from "@/lib/api/client";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Archive,
  CheckCircle2,
  Database,
  HardDrive,
  Info,
  RefreshCw,
  Server,
  XCircle,
} from "lucide-react";
import { useMemo } from "react";

export const Route = createFileRoute("/situation")({
  beforeLoad: ({ location }) => {
    if (!apiClient.getToken()) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: SituationPage,
  head: () => ({
    meta: [
      { title: "Situation - DumpStation" },
      {
        name: "description",
        content:
          "Single-screen situation overview of the DumpStation backup system — fleet posture, throughput, alerts, and live activity at a glance.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Derivations (24h hour buckets + 14d day buckets)
// ─────────────────────────────────────────────────────────────────────────────

type HourCell = { hour: Date; total: number; success: number; failed: number };
type DayCell = { date: Date; total: number; success: number; failed: number };

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

function buildHourSeries(backups: Backup[], hours = 24): HourCell[] {
  const now = new Date();
  const start = startOfHourLocal(new Date(now.getTime() - (hours - 1) * 3600_000));
  const cells: HourCell[] = Array.from({ length: hours }, (_, i) => ({
    hour: new Date(start.getTime() + i * 3600_000),
    total: 0,
    success: 0,
    failed: 0,
  }));
  for (const b of backups) {
    const t = startOfHourLocal(new Date(b.timestamp)).getTime();
    const diff = Math.floor((t - start.getTime()) / 3600_000);
    if (diff < 0 || diff >= hours) continue;
    const c = cells[diff];
    c.total += 1;
    if (b.status === "success") c.success += 1;
    else if (b.status === "failed") c.failed += 1;
  }
  return cells;
}

function buildDaySeries(backups: Backup[], days = 14): DayCell[] {
  const today = startOfDayLocal(new Date());
  const start = new Date(today.getTime() - (days - 1) * 86_400_000);
  const cells: DayCell[] = Array.from({ length: days }, (_, i) => ({
    date: new Date(start.getTime() + i * 86_400_000),
    total: 0,
    success: 0,
    failed: 0,
  }));
  for (const b of backups) {
    const t = startOfDayLocal(new Date(b.timestamp)).getTime();
    const diff = Math.floor((t - start.getTime()) / 86_400_000);
    if (diff < 0 || diff >= days) continue;
    const c = cells[diff];
    c.total += 1;
    if (b.status === "success") c.success += 1;
    else if (b.status === "failed") c.failed += 1;
  }
  return cells;
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel — a uniform flexible cell with an eyebrow header and content.
// All panels use `min-h-0` and internal overflow-hidden so the no-scroll
// outer container can squeeze them when the viewport is short.
// ─────────────────────────────────────────────────────────────────────────────

function Panel({
  eyebrow,
  title,
  accent,
  children,
  className,
  trailing,
}: {
  eyebrow: React.ReactNode;
  title?: React.ReactNode;
  accent?: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative bg-canvas border border-hairline-soft rounded-app-lg flex flex-col min-h-0 overflow-hidden",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-2 border-b border-hairline-soft">
        <div className="min-w-0">
          <Eyebrow>{eyebrow}</Eyebrow>
          {title && (
            <p className="text-caption text-on-primary truncate mt-0.5">{title}</p>
          )}
        </div>
        {(accent || trailing) && (
          <div className="flex items-center gap-2 shrink-0">
            {trailing}
            {accent}
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden p-3">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Top status bar — single row, always visible
// ─────────────────────────────────────────────────────────────────────────────

function StatusTicker({
  now,
  health,
  successRate,
  failed24h,
  inFlight,
  fleetActive,
  fleetTotal,
  syncLabel,
  onRefresh,
  isRefetching,
}: {
  now: Date;
  health: "healthy" | "warning" | "critical";
  successRate: number;
  failed24h: number;
  inFlight: number;
  fleetActive: number;
  fleetTotal: number;
  syncLabel: string;
  onRefresh: () => void;
  isRefetching: boolean;
}) {
  const healthLabel =
    health === "healthy"
      ? "Operational"
      : health === "warning"
        ? "Degraded"
        : "Critical";

  const healthTone =
    health === "healthy"
      ? "success"
      : health === "warning"
        ? "warning"
        : "danger";

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 bg-canvas border border-hairline-soft rounded-app-lg overflow-hidden">
      {/* Left — status + branding */}
      <div className="flex items-center gap-3 min-w-0">
        <LiveDot tone={healthTone} />
        <span
          className={cn(
            "text-button-uppercase tracking-wider",
            healthTone === "success"
              ? "text-success"
              : healthTone === "warning"
                ? "text-amber-400"
                : "text-error",
          )}
        >
          {healthLabel}
        </span>
        <span className="hidden sm:inline text-mono-caps uppercase text-graphite">/</span>
        <Eyebrow as="span" className="hidden sm:inline">
          Console · Situation room
        </Eyebrow>
      </div>

      {/* Middle — live ledger */}
      <div className="hidden lg:flex items-center gap-5 text-mono-caps uppercase text-mute shrink-0">
        <TickerCell label="Local" value={now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} />
        <TickerCell label="Sync" value={syncLabel} />
        <TickerCell label="Success" value={formatPercentage(successRate)} tone={healthTone} />
        <TickerCell
          label="Fleet"
          value={`${fleetActive}/${fleetTotal}`}
        />
        <TickerCell
          label="Failed 24h"
          value={failed24h.toString()}
          tone={failed24h > 0 ? "danger" : "default"}
        />
        <TickerCell
          label="Live"
          value={inFlight.toString()}
          tone={inFlight > 0 ? "info" : "default"}
        />
      </div>

      {/* Right — refresh */}
      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefetching}
        className="inline-flex items-center gap-2 text-mono-caps uppercase text-ash hover:text-on-primary transition-colors disabled:opacity-50"
        aria-label="Refresh"
      >
        <RefreshCw className={cn("size-3.5", isRefetching && "animate-spin")} />
        <span className="hidden xxs:inline">Refresh</span>
      </button>
    </div>
  );
}

function TickerCell({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const valueClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-amber-400"
        : tone === "danger"
          ? "text-error"
          : tone === "info"
            ? "text-link-blue-soft"
            : "text-ash";
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-mute/70">{label}</span>
      <span className={cn("tabular-nums", valueClass)}>{value}</span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero KPI cell — bigger than KpiTile, compact for situation room
// ─────────────────────────────────────────────────────────────────────────────

function HeroStat({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ElementType;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const valueClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-amber-400"
        : tone === "danger"
          ? "text-error"
          : tone === "info"
            ? "text-link-blue-soft"
            : "text-on-primary";

  return (
    <div className="relative bg-canvas border border-hairline-soft rounded-app-lg p-4 overflow-hidden flex flex-col gap-1">
      <div className="flex items-start justify-between">
        <Eyebrow>{label}</Eyebrow>
        <Icon
          className={cn(
            "size-4",
            tone === "success"
              ? "text-success"
              : tone === "warning"
                ? "text-amber-400"
                : tone === "danger"
                  ? "text-error"
                  : tone === "info"
                    ? "text-link-blue-soft"
                    : "text-ash",
          )}
        />
      </div>
      <p className={cn("text-heading-md tabular-nums leading-none mt-1", valueClass)}>
        {value}
      </p>
      {hint && <p className="text-mono-caps uppercase text-mute truncate">{hint}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 24-hour pulse heatmap (compact, fits one row)
// ─────────────────────────────────────────────────────────────────────────────

function HourPulse({ series }: { series: HourCell[] }) {
  const peak = Math.max(1, ...series.map((h) => h.total));
  return (
    <div className="flex flex-col gap-2 h-full">
      <div
        className="grid gap-px flex-1 min-h-0"
        style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}
      >
        {series.map((h, i) => {
          const intensity = h.total === 0 ? 0 : Math.min(1, h.total / peak);
          const failed = h.failed > 0;
          const bg = failed
            ? `rgba(221, 0, 0, ${0.3 + intensity * 0.7})`
            : h.total > 0
              ? `rgba(55, 205, 132, ${0.2 + intensity * 0.7})`
              : "transparent";
          return (
            <div
              key={i}
              title={`${h.hour.getHours().toString().padStart(2, "0")}:00 — ${h.total} run${h.total === 1 ? "" : "s"}${failed ? `, ${h.failed} failed` : ""}`}
              className="border border-graphite/60 rounded-[1px] transition-transform hover:scale-110 hover:z-10"
              style={{ background: bg }}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-mono-micro text-mute uppercase">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span className="text-ash">now</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fleet posture donut (compact, fits inside a small panel)
// ─────────────────────────────────────────────────────────────────────────────

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
  const R = 40;
  const C = 2 * Math.PI * R;
  const aArc = (active / safe) * C;
  const pArc = (paused / safe) * C;
  const dArc = (disabled / safe) * C;

  return (
    <div className="flex items-center gap-4 h-full">
      <div className="relative shrink-0 size-24">
        <svg viewBox="0 0 100 100" className="size-24 -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--graphite)" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="var(--success)"
            strokeWidth="8"
            strokeDasharray={`${aArc} ${C}`}
          />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="rgb(251 191 36)"
            strokeWidth="8"
            strokeDasharray={`${pArc} ${C}`}
            strokeDashoffset={-aArc}
          />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="var(--mute)"
            strokeWidth="8"
            strokeDasharray={`${dArc} ${C}`}
            strokeDashoffset={-(aArc + pArc)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-heading-sm tabular-nums text-on-primary leading-none">
            {total}
          </span>
          <span className="text-mono-micro uppercase text-mute mt-0.5">dbs</span>
        </div>
      </div>
      <div className="space-y-1.5 text-caption flex-1 min-w-0">
        <DonutRow color="bg-success" label="Active" value={active} />
        <DonutRow color="bg-amber-400" label="Paused" value={paused} />
        <DonutRow color="bg-mute" label="Disabled" value={disabled} />
      </div>
    </div>
  );
}

function DonutRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("size-2 rounded-full shrink-0", color)} />
      <span className="text-ash flex-1 truncate">{label}</span>
      <span className="text-mono-caps uppercase text-mute tabular-nums">{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage mix mini (R2 vs S3 + per-bucket bytes)
// ─────────────────────────────────────────────────────────────────────────────

function StorageMix({
  storages,
  databases,
  backups,
  totalBytes,
}: {
  storages: StorageConfig[];
  databases: DatabaseConfig[];
  backups: Backup[];
  totalBytes: number;
}) {
  const dbToStorage = new Map(databases.map((d) => [d.id, d.storage_id]));
  const byBucket = new Map<string, number>();
  for (const b of backups) {
    if (b.status !== "success" || !b.size_bytes) continue;
    const sid = dbToStorage.get(b.database_id);
    if (!sid) continue;
    byBucket.set(sid, (byBucket.get(sid) ?? 0) + b.size_bytes);
  }
  const ranked = storages
    .map((s) => ({ s, bytes: byBucket.get(s.id) ?? 0 }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 3);

  const r2 = storages.filter((s) => s.provider === "r2").length;
  const s3 = storages.filter((s) => s.provider === "s3").length;
  const safe = Math.max(1, storages.length);

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-baseline justify-between">
        <span className="text-heading-sm tabular-nums text-on-primary">
          {formatBytes(totalBytes)}
        </span>
        <span className="text-mono-caps uppercase text-mute">
          {storages.length} bucket{storages.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex h-2 w-full rounded-full overflow-hidden bg-canvas-soft border border-hairline-soft">
        <div
          className="bg-link-blue-soft"
          style={{ width: `${(r2 / safe) * 100}%` }}
          title={`R2: ${r2}`}
        />
        <div
          className="bg-brand"
          style={{ width: `${(s3 / safe) * 100}%` }}
          title={`S3: ${s3}`}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 text-mono-micro uppercase">
        <span className="inline-flex items-center gap-1.5 text-ash">
          <span className="size-1.5 rounded-full bg-link-blue-soft" /> R2 · {r2}
        </span>
        <span className="inline-flex items-center gap-1.5 text-ash">
          <span className="size-1.5 rounded-full bg-brand" /> S3 · {s3}
        </span>
      </div>
      <div className="space-y-1.5 min-h-0">
        {ranked.length === 0 ? (
          <p className="text-mono-caps uppercase text-mute">No data yet</p>
        ) : (
          ranked.map((r) => (
            <div key={r.s.id} className="flex items-baseline gap-2 text-caption">
              <span className="size-1.5 rounded-full bg-on-primary/60 shrink-0" />
              <span className="text-on-primary truncate flex-1">{r.s.name}</span>
              <span className="text-mono-caps uppercase text-mute tabular-nums">
                {formatBytes(r.bytes)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fleet status board — compact rows per database with 14-day strip
// ─────────────────────────────────────────────────────────────────────────────

function FleetBoard({
  databases,
  backups,
}: {
  databases: DatabaseConfig[];
  backups: Backup[];
}) {
  // Sort: failing first, then paused, then active, then disabled.
  const ordered = useMemo(() => {
    return [...databases].sort((a, b) => {
      const score = (d: DatabaseConfig) => {
        if (!d.enabled) return 3;
        if (d.paused) return 2;
        return 1;
      };
      const aScore = score(a);
      const bScore = score(b);
      if (aScore !== bScore) return aScore - bScore;
      return a.name.localeCompare(b.name);
    });
  }, [databases]);

  if (databases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-6">
        <Database className="size-7 text-ash" />
        <p className="text-caption text-ash">No databases configured.</p>
        <Link to="/databases" className="text-mono-caps uppercase text-link-blue-soft hover:text-on-primary">
          Add database →
        </Link>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="hidden md:grid grid-cols-[1.5fr_0.7fr_1.4fr_0.6fr] gap-3 px-2 pb-1.5 border-b border-hairline-soft text-mono-micro uppercase text-mute shrink-0">
        <span>Database</span>
        <span>Last run</span>
        <span>14-day</span>
        <span className="text-right">State</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-hairline-soft pr-1">
        {ordered.map((db) => (
          <FleetRow key={db.id} db={db} backups={backups} />
        ))}
      </div>
    </div>
  );
}

function FleetRow({ db, backups }: { db: DatabaseConfig; backups: Backup[] }) {
  const dbBackups = useMemo(
    () => backups.filter((b) => b.database_id === db.id),
    [backups, db.id],
  );
  const days = useMemo(() => buildDaySeries(dbBackups, 14), [dbBackups]);
  const last = dbBackups
    .slice()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

  const stateLabel = !db.enabled ? "Off" : db.paused ? "Paused" : "Active";
  const stateClass = !db.enabled
    ? "text-mute"
    : db.paused
      ? "text-amber-400"
      : "text-success";
  const stateDot = !db.enabled
    ? "bg-mute"
    : db.paused
      ? "bg-amber-400"
      : "bg-success";

  return (
    <div className="grid md:grid-cols-[1.5fr_0.7fr_1.4fr_0.6fr] grid-cols-1 gap-3 px-2 py-2 items-center hover:bg-canvas-soft/40 transition-colors">
      {/* Name */}
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn("size-2 rounded-full shrink-0", stateDot)} />
        <div className="min-w-0">
          <p className="text-caption-tight text-on-primary truncate leading-tight">
            {db.name}
          </p>
          <p className="text-mono-micro uppercase text-mute truncate">
            {db.host}:{db.port}
          </p>
        </div>
      </div>

      {/* Last run */}
      <div className="min-w-0 hidden md:block">
        {last ? (
          <>
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
            <p className="text-mono-micro uppercase text-mute truncate">
              {formatDistanceToNow(new Date(last.timestamp), { addSuffix: true })}
            </p>
          </>
        ) : (
          <p className="text-mono-micro uppercase text-mute italic">no runs</p>
        )}
      </div>

      {/* 14-day strip */}
      <div className="hidden md:flex items-center gap-px h-5">
        {days.map((d, i) => {
          const cls =
            d.total === 0
              ? "bg-graphite/50"
              : d.failed > 0
                ? "bg-error/80"
                : "bg-success/70";
          return (
            <div
              key={i}
              title={`${d.date.toDateString()} · ${d.total} run${d.total === 1 ? "" : "s"}`}
              className={cn("flex-1 h-full rounded-[1px]", cls)}
            />
          );
        })}
      </div>

      {/* State */}
      <div className="text-right">
        <span className={cn("text-mono-micro uppercase tabular-nums", stateClass)}>
          {stateLabel}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Server status (PostgreSQL admin servers)
// ─────────────────────────────────────────────────────────────────────────────

function ServersStrip({ servers }: { servers: ServerConnection[] }) {
  if (servers.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-mono-caps uppercase text-mute py-4">
        No servers
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-1.5 h-full overflow-y-auto pr-1">
      {servers.map((s) => {
        const healthy =
          s.last_tested_at &&
          s.last_test_status?.toLowerCase() === "ok";
        const degraded =
          s.last_tested_at &&
          s.last_test_status &&
          s.last_test_status.toLowerCase() !== "ok";
        const dot = healthy
          ? "bg-success"
          : degraded
            ? "bg-error"
            : "bg-mute";
        return (
          <div
            key={s.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded-app-sm border border-hairline-soft bg-canvas-soft min-w-0"
          >
            <span className={cn("size-2 rounded-full shrink-0", dot)} />
            <span className="text-caption-tight text-on-primary truncate flex-1">{s.name}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Alerts — failed backups
// ─────────────────────────────────────────────────────────────────────────────

function AlertsList({
  failed,
  databaseMap,
}: {
  failed: Backup[];
  databaseMap: Map<string, DatabaseConfig>;
}) {
  if (failed.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1.5 py-2">
        <CheckCircle2 className="size-6 text-success" />
        <p className="text-caption-tight text-on-primary">All systems green</p>
        <p className="text-mono-micro uppercase text-mute">No failed backups</p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5 h-full overflow-y-auto pr-1">
      {failed.slice(0, 6).map((b) => {
        const db = databaseMap.get(b.database_id);
        return (
          <Link
            key={b.id}
            to="/backups"
            className="flex items-start gap-2 px-2 py-1.5 rounded-app-sm border border-hairline-soft bg-canvas-soft hover:border-error/40 transition-colors group"
          >
            <XCircle className="size-3.5 text-error shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-caption-tight text-on-primary truncate">
                {db?.name ?? "Unknown"}
              </p>
              <p className="text-mono-micro uppercase text-mute truncate">
                {formatDistanceToNow(new Date(b.timestamp), { addSuffix: true })}
                {b.error_message ? ` · ${b.error_message}` : ""}
              </p>
            </div>
          </Link>
        );
      })}
      {failed.length > 6 && (
        <Link
          to="/backups"
          className="text-mono-micro uppercase text-link-blue-soft hover:text-on-primary text-center block py-1"
        >
          + {failed.length - 6} more →
        </Link>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity stream — latest events
// ─────────────────────────────────────────────────────────────────────────────

const activityIconMap: Record<
  ActivityLog["level"],
  { Icon: React.ElementType; tone: string }
> = {
  info: { Icon: Info, tone: "text-link-blue-soft" },
  success: { Icon: CheckCircle2, tone: "text-success" },
  warning: { Icon: AlertTriangle, tone: "text-amber-400" },
  error: { Icon: AlertCircle, tone: "text-error" },
};

const actionLabels: Record<string, string> = {
  backup_completed: "Backup completed",
  backup_failed: "Backup failed",
  backup_triggered: "Backup triggered",
  database_created: "Database added",
  database_paused: "Database paused",
  database_unpaused: "Database resumed",
  storage_created: "Storage configured",
  login: "User signed in",
};

function ActivityStream({ logs }: { logs: ActivityLog[] }) {
  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-mono-caps uppercase text-mute py-2">
        No recent events
      </div>
    );
  }
  return (
    <div className="space-y-1 h-full overflow-y-auto pr-1">
      {logs.slice(0, 8).map((log) => {
        const { Icon, tone } = activityIconMap[log.level];
        return (
          <div key={log.id} className="flex items-center gap-2 px-2 py-1 rounded-app-sm hover:bg-canvas-soft transition-colors">
            <Icon className={cn("size-3.5 shrink-0", tone)} />
            <span className="text-caption-tight text-on-primary truncate flex-1">
              {actionLabels[log.action] ?? log.action.replace(/_/g, " ")}
              {log.entity_name && (
                <span className="text-mute"> · {log.entity_name}</span>
              )}
            </span>
            <span className="text-mono-micro uppercase text-mute shrink-0">
              {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────

function SituationPage() {
  const now = useNow();
  const {
    data: stats,
    refetch,
    isRefetching,
    dataUpdatedAt,
  } = useSystemStats();
  const { data: backups } = useBackups();
  const { data: databases } = useDatabases();
  const { data: servers } = useDbServers();
  const { data: storages } = useStorageConfigs();
  const { data: activity } = useActivityLogs({ limit: 12 });

  const list = backups ?? [];
  const dbs = databases ?? [];
  const srv = servers ?? [];
  const sto = storages ?? [];

  const cutoff24h = Date.now() - 24 * 3600_000;
  const runs24h = useMemo(
    () => list.filter((b) => new Date(b.timestamp).getTime() >= cutoff24h),
    [list, cutoff24h],
  );
  const failed24h = useMemo(
    () => runs24h.filter((b) => b.status === "failed"),
    [runs24h],
  );
  const inFlight = useMemo(
    () => list.filter((b) => b.status === "running" || b.status === "pending"),
    [list],
  );
  const allFailed = useMemo(
    () => list.filter((b) => b.status === "failed"),
    [list],
  );

  const active = dbs.filter((d) => d.enabled && !d.paused).length;
  const paused = dbs.filter((d) => d.paused).length;
  const disabled = dbs.filter((d) => !d.enabled).length;

  const databaseMap = useMemo(
    () => new Map(dbs.map((d) => [d.id, d])),
    [dbs],
  );

  const hourSeries = useMemo(() => buildHourSeries(runs24h, 24), [runs24h]);

  const successRate = stats?.success_rate_24h ?? 0;
  const totalStorageBytes = stats?.total_storage_used_bytes ?? 0;
  const totalRuns24h = stats?.total_backups_24h ?? runs24h.length;

  const health: "healthy" | "warning" | "critical" =
    failed24h.length === 0 && successRate >= 90
      ? "healthy"
      : failed24h.length < 5 && successRate >= 70
        ? "warning"
        : "critical";

  const lastSyncSec =
    dataUpdatedAt > 0
      ? Math.max(0, Math.floor((now.getTime() - dataUpdatedAt) / 1000))
      : null;
  const lastSyncLabel =
    lastSyncSec === null
      ? "—"
      : lastSyncSec < 60
        ? `${lastSyncSec}s ago`
        : `${Math.floor(lastSyncSec / 60)}m ago`;

  // Server health summary
  const healthyServers = srv.filter(
    (s) => s.last_test_status?.toLowerCase() === "ok",
  ).length;
  const degradedServers = srv.filter(
    (s) => s.last_test_status && s.last_test_status.toLowerCase() !== "ok",
  ).length;

  return (
    <AppLayout compact>
      <div className="h-[calc(100dvh-4rem)] flex flex-col gap-2.5 py-3 overflow-hidden animate-in fade-in duration-500">
        {/* Row 1 — Top ticker */}
        <StatusTicker
          now={now}
          health={health}
          successRate={successRate}
          failed24h={failed24h.length}
          inFlight={inFlight.length}
          fleetActive={active}
          fleetTotal={dbs.length}
          syncLabel={lastSyncLabel}
          onRefresh={() => refetch()}
          isRefetching={isRefetching}
        />

        {/* Row 2 — Hero stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 shrink-0">
          <HeroStat
            label="Success rate · 24h"
            icon={CheckCircle2}
            tone={
              successRate >= 95
                ? "success"
                : successRate >= 80
                  ? "warning"
                  : "danger"
            }
            value={formatPercentage(successRate)}
            hint={`${totalRuns24h} runs · ${failed24h.length} failed`}
          />
          <HeroStat
            label="Backups · 24h"
            icon={Archive}
            tone={failed24h.length > 0 ? "warning" : "default"}
            value={totalRuns24h}
            hint={
              inFlight.length > 0
                ? `${inFlight.length} live now`
                : "Idle"
            }
          />
          <HeroStat
            label="Storage used"
            icon={HardDrive}
            value={formatBytes(totalStorageBytes)}
            hint={`${sto.length} bucket${sto.length === 1 ? "" : "s"}`}
          />
          <HeroStat
            label="Fleet"
            icon={Database}
            tone={paused + disabled === 0 ? "success" : "warning"}
            value={`${active}/${dbs.length}`}
            hint={`${paused} paused · ${disabled} off`}
          />
        </div>

        {/* Row 3 — Bento (fills remaining height) */}
        <div className="flex-1 min-h-0 grid grid-cols-12 gap-2.5">
          {/* Left column — pulse + fleet status */}
          <div className="col-span-12 lg:col-span-7 flex flex-col gap-2.5 min-h-0">
            <Panel
              eyebrow="24-hour pulse"
              title="Backup runs by the hour"
              accent={
                <Badge variant={failed24h.length === 0 ? "success" : "warning"}>
                  <LiveDot tone={failed24h.length === 0 ? "success" : "warning"} />{" "}
                  {totalRuns24h} runs
                </Badge>
              }
              className="h-[120px] shrink-0"
            >
              <HourPulse series={hourSeries} />
            </Panel>

            <Panel
              eyebrow="Database fleet"
              title={`${dbs.length} configurations · ${active} active`}
              accent={
                allFailed.length > 0 ? (
                  <Badge variant="error">
                    <AlertTriangle className="size-2.5" /> {allFailed.length} failing
                  </Badge>
                ) : (
                  <Badge variant="success">
                    <CheckCircle2 className="size-2.5" /> Healthy
                  </Badge>
                )
              }
              trailing={
                <Link
                  to="/databases"
                  className="text-mono-micro uppercase text-ash hover:text-on-primary"
                >
                  Manage →
                </Link>
              }
              className="flex-1 min-h-0"
            >
              <FleetBoard databases={dbs} backups={list} />
            </Panel>
          </div>

          {/* Right column — posture + storage + servers + alerts + activity */}
          <div className="col-span-12 lg:col-span-5 grid grid-cols-2 gap-2.5 min-h-0 auto-rows-fr">
            <Panel
              eyebrow="Fleet posture"
              className="col-span-1"
            >
              <PostureDonut active={active} paused={paused} disabled={disabled} />
            </Panel>

            <Panel
              eyebrow="Storage"
              accent={
                <Badge variant="mono">
                  <HardDrive className="size-2.5" /> {sto.length}
                </Badge>
              }
              className="col-span-1"
            >
              <StorageMix
                storages={sto}
                databases={dbs}
                backups={list}
                totalBytes={totalStorageBytes}
              />
            </Panel>

            <Panel
              eyebrow={`Alerts · ${allFailed.length}`}
              trailing={
                allFailed.length === 0 ? null : (
                  <Link
                    to="/backups"
                    className="text-mono-micro uppercase text-ash hover:text-on-primary"
                  >
                    Triage →
                  </Link>
                )
              }
              accent={
                allFailed.length === 0 ? null : (
                  <Badge variant="error">
                    <LiveDot tone="danger" />
                    {allFailed.length}
                  </Badge>
                )
              }
              className="col-span-2"
            >
              <AlertsList failed={allFailed} databaseMap={databaseMap} />
            </Panel>

            <Panel
              eyebrow="Servers"
              accent={
                <Badge
                  variant={degradedServers === 0 ? (healthyServers > 0 ? "success" : "mono") : "error"}
                >
                  <Server className="size-2.5" />
                  {healthyServers}/{srv.length}
                </Badge>
              }
              className="col-span-1"
            >
              <ServersStrip servers={srv} />
            </Panel>

            <Panel
              eyebrow="Latest events"
              trailing={
                <Link
                  to="/activity"
                  className="text-mono-micro uppercase text-ash hover:text-on-primary"
                >
                  All →
                </Link>
              }
              accent={
                <Badge variant="mono">
                  <Activity className="size-2.5" /> {(activity?.total ?? 0).toLocaleString()}
                </Badge>
              }
              className="col-span-1"
            >
              <ActivityStream logs={activity?.logs ?? []} />
            </Panel>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
