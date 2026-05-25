import { AppLayout } from "@/components/app-layout";
import { BackupList } from "@/components/backup-list";
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
import type { Backup, BackupStatus } from "@/lib/types/api";
import { formatBytes, formatPercentage } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  Archive,
  CheckCircle2,
  Database,
  HardDrive,
  Loader2,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useMemo } from "react";

export const Route = createFileRoute("/backups")({
  component: BackupsPage,
  head: () => ({
    meta: [
      { title: "Backups - DumpStation" },
      {
        name: "description",
        content:
          "View and manage your PostgreSQL database backups. Track backup history and status.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Backups - DumpStation" },
      {
        property: "og:description",
        content:
          "View and manage your PostgreSQL database backups. Track backup history and status.",
      },
      {
        property: "og:url",
        content: "https://dumpstation.monzim.com/backups",
      },
      { name: "twitter:title", content: "Backups - DumpStation" },
      {
        name: "twitter:description",
        content:
          "View and manage your PostgreSQL database backups. Track backup history and status.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://dumpstation.monzim.com/backups",
      },
    ],
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Derivations
// ─────────────────────────────────────────────────────────────────────────────

function startOfDayLocal(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

type DayVolume = { date: Date; total: number; success: number; failed: number; bytes: number };

function buildVolumeSeries(backups: Backup[], days = 14): DayVolume[] {
  const today = startOfDayLocal(new Date());
  const seriesStart = new Date(today.getTime() - (days - 1) * 86_400_000);
  const cells: DayVolume[] = Array.from({ length: days }, (_, i) => ({
    date: new Date(seriesStart.getTime() + i * 86_400_000),
    total: 0,
    success: 0,
    failed: 0,
    bytes: 0,
  }));
  for (const b of backups) {
    const t = startOfDayLocal(new Date(b.timestamp)).getTime();
    const diff = Math.floor((t - seriesStart.getTime()) / 86_400_000);
    if (diff < 0 || diff >= days) continue;
    const cell = cells[diff];
    cell.total += 1;
    if (b.status === "success") cell.success += 1;
    else if (b.status === "failed") cell.failed += 1;
    if (b.size_bytes) cell.bytes += b.size_bytes;
  }
  return cells;
}

const statusOrder: BackupStatus[] = ["success", "running", "pending", "failed"];
const statusMeta: Record<
  BackupStatus,
  { label: string; tone: "success" | "info" | "warning" | "danger"; bar: string; text: string }
> = {
  success: { label: "Success", tone: "success", bar: "bg-success", text: "text-success" },
  running: { label: "Running", tone: "info", bar: "bg-link-blue-soft", text: "text-link-blue-soft" },
  pending: { label: "Pending", tone: "warning", bar: "bg-amber-400", text: "text-amber-400" },
  failed: { label: "Failed", tone: "danger", bar: "bg-error", text: "text-error" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot card: status mix + 14-day volume + top databases
// ─────────────────────────────────────────────────────────────────────────────

function StatusMixBar({
  counts,
  total,
}: {
  counts: Record<BackupStatus, number>;
  total: number;
}) {
  const safeTotal = Math.max(1, total);
  return (
    <div className="space-y-4">
      <div className="flex h-3 w-full rounded-full overflow-hidden border border-hairline-soft bg-canvas-soft">
        {statusOrder.map((s) => {
          const pct = (counts[s] / safeTotal) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={s}
              className={cn("h-full transition-all duration-500", statusMeta[s].bar)}
              style={{ width: `${pct}%` }}
              title={`${statusMeta[s].label}: ${counts[s]} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statusOrder.map((s) => {
          const count = counts[s];
          const pct = (count / safeTotal) * 100;
          return (
            <div key={s} className="flex items-start gap-2">
              <span className={cn("mt-1.5 size-2 rounded-full", statusMeta[s].bar)} />
              <div className="min-w-0">
                <p className={cn("text-heading-sm tabular-nums", statusMeta[s].text)}>{count}</p>
                <p className="text-mono-caps uppercase text-mute">
                  {statusMeta[s].label} · {pct.toFixed(1)}%
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VolumeChart({ series }: { series: DayVolume[] }) {
  const max = Math.max(1, ...series.map((d) => d.total));
  const totalBytes = series.reduce((acc, d) => acc + d.bytes, 0);
  const totalRuns = series.reduce((acc, d) => acc + d.total, 0);
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-px h-24">
        {series.map((d, i) => {
          const heightPct = (d.total / max) * 100;
          const isToday = i === series.length - 1;
          return (
            <div
              key={i}
              className="group flex-1 h-full flex flex-col justify-end items-stretch relative"
              title={`${d.date.toDateString()} · ${d.total} run${d.total === 1 ? "" : "s"}${d.failed ? `, ${d.failed} failed` : ""}`}
            >
              {d.total > 0 ? (
                <div className="flex flex-col-reverse h-full">
                  <div
                    className="bg-success/80 group-hover:bg-success transition-colors"
                    style={{ height: `${(d.success / d.total) * heightPct}%`, minHeight: d.success ? "2px" : 0 }}
                  />
                  <div
                    className="bg-error/80 group-hover:bg-error transition-colors"
                    style={{ height: `${(d.failed / d.total) * heightPct}%`, minHeight: d.failed ? "2px" : 0 }}
                  />
                </div>
              ) : (
                <div className="h-px bg-graphite/60" />
              )}
              {isToday && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 h-2 w-px bg-on-primary/40" />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-mono-micro text-mute uppercase">
        <span>−14d</span>
        <span className="hidden xxs:inline">−10d</span>
        <span>−7d</span>
        <span className="hidden xxs:inline">−3d</span>
        <span className="text-ash">today</span>
      </div>
      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-hairline-soft">
        <div>
          <p className="text-heading-sm tabular-nums text-on-primary">{totalRuns}</p>
          <p className="text-mono-caps uppercase text-mute">Runs · 14d</p>
        </div>
        <div>
          <p className="text-heading-sm tabular-nums text-on-primary">{formatBytes(totalBytes)}</p>
          <p className="text-mono-caps uppercase text-mute">Bytes archived</p>
        </div>
      </div>
    </div>
  );
}

function TopDatabasesPanel({
  backups,
  databaseNames,
}: {
  backups: Backup[];
  databaseNames: Map<string, string>;
}) {
  const ranked = useMemo(() => {
    const map = new Map<string, { runs: number; bytes: number; lastTs: number; failed: number }>();
    for (const b of backups) {
      const cur = map.get(b.database_id) ?? { runs: 0, bytes: 0, lastTs: 0, failed: 0 };
      cur.runs += 1;
      if (b.size_bytes) cur.bytes += b.size_bytes;
      const ts = new Date(b.timestamp).getTime();
      if (ts > cur.lastTs) cur.lastTs = ts;
      if (b.status === "failed") cur.failed += 1;
      map.set(b.database_id, cur);
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 5);
  }, [backups]);

  const max = Math.max(1, ...ranked.map((r) => r.bytes));

  if (ranked.length === 0) {
    return (
      <div className="text-center space-y-2 py-6">
        <Database className="size-7 mx-auto text-ash" />
        <p className="text-caption text-ash">No backups yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {ranked.map((row, i) => {
        const pct = (row.bytes / max) * 100;
        const name = databaseNames.get(row.id) ?? "Unknown database";
        return (
          <div key={row.id} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2">
                <span className="text-mono-micro uppercase text-mute font-mono tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="text-body-sm text-on-primary truncate">{name}</p>
                {row.failed > 0 && <Badge variant="error">{row.failed} fail</Badge>}
              </div>
              <p className="text-mono-caps tabular-nums text-ash shrink-0">
                {formatBytes(row.bytes)}
              </p>
            </div>
            <div className="h-1 w-full bg-graphite/60 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  row.failed > 0 ? "bg-amber-400" : "bg-on-primary",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-mono-micro uppercase text-mute">
              {row.runs} run{row.runs === 1 ? "" : "s"} · last{" "}
              {formatDistanceToNow(new Date(row.lastTs), { addSuffix: true })}
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

function BackupsPage() {
  const { data: backups, isLoading } = useBackups();
  const { data: databases } = useDatabases();
  const now = useNow();

  const list = backups ?? [];
  const dbNameMap = useMemo(
    () => new Map((databases ?? []).map((d) => [d.id, d.name])),
    [databases],
  );

  const counts: Record<BackupStatus, number> = useMemo(
    () => ({
      success: list.filter((b) => b.status === "success").length,
      failed: list.filter((b) => b.status === "failed").length,
      running: list.filter((b) => b.status === "running").length,
      pending: list.filter((b) => b.status === "pending").length,
    }),
    [list],
  );

  const completed = counts.success + counts.failed;
  const successRate = completed === 0 ? 0 : (counts.success / completed) * 100;

  const totalBytes = useMemo(
    () => list.filter((b) => b.status === "success").reduce((acc, b) => acc + (b.size_bytes ?? 0), 0),
    [list],
  );

  const cutoff24h = Date.now() - 24 * 3600_000;
  const failed24h = useMemo(
    () => list.filter((b) => b.status === "failed" && new Date(b.timestamp).getTime() >= cutoff24h),
    [list, cutoff24h],
  );
  const runs24h = useMemo(
    () => list.filter((b) => new Date(b.timestamp).getTime() >= cutoff24h),
    [list, cutoff24h],
  );

  const inFlight = counts.running + counts.pending;
  const volumeSeries = useMemo(() => buildVolumeSeries(list, 14), [list]);
  const successTone =
    successRate >= 95 ? "success" : successRate >= 80 ? "warning" : "danger";

  return (
    <AppLayout>
      <div className="space-y-12 animate-in fade-in duration-500">
        <PageBriefing
          eyebrow={`Archive · Backup ledger · ${now.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}`}
          title="Backup"
          echo="history."
          subtitle="Every artifact DumpStation has produced — searchable, downloadable, restorable."
          ledger={[
            {
              label: "Live",
              value: (
                <span className="inline-flex items-center gap-2">
                  <LiveDot
                    tone={
                      counts.failed === 0 ? "success" : counts.failed < 5 ? "warning" : "danger"
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
            { label: "Total", value: list.length.toLocaleString() },
            { label: "24h", value: `${runs24h.length} run${runs24h.length === 1 ? "" : "s"}` },
          ]}
        />

        {/* KPI strip */}
        <section className="space-y-4">
          <SectionRule label="01 · Indicators" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiTile
              label="Total backups"
              icon={Archive}
              value={list.length.toLocaleString()}
              hint={`${completed} completed · ${inFlight} live`}
              isLoading={isLoading}
            />
            <KpiTile
              label="Success rate"
              icon={CheckCircle2}
              tone={successTone}
              value={formatPercentage(successRate)}
              hint={`${counts.success} / ${completed} completed`}
              isLoading={isLoading}
            />
            <KpiTile
              label="Bytes archived"
              icon={HardDrive}
              value={formatBytes(totalBytes)}
              hint={`across ${counts.success.toLocaleString()} artifact${counts.success === 1 ? "" : "s"}`}
              isLoading={isLoading}
            />
            <KpiTile
              label="Failed · 24h"
              icon={XCircle}
              tone={failed24h.length > 0 ? "danger" : "default"}
              value={failed24h.length}
              hint={
                failed24h.length === 0
                  ? "No incidents"
                  : `${(failed24h.length / Math.max(1, runs24h.length) * 100).toFixed(1)}% of runs`
              }
              isLoading={isLoading}
            />
          </div>
        </section>

        {/* Snapshot grid: status mix, volume, top databases */}
        <section className="space-y-4">
          <SectionRule label="02 · Snapshot" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <Card className="lg:col-span-5 p-0 overflow-hidden">
              <div className="border-b border-hairline-soft p-6 lg:p-8">
                <Eyebrow>Status mix</Eyebrow>
                <p className="text-heading-sm text-on-primary mt-1">All-time distribution</p>
              </div>
              <div className="p-6 lg:p-8">
                {isLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : list.length === 0 ? (
                  <div className="text-center py-6 space-y-2">
                    <Archive className="size-7 mx-auto text-ash" />
                    <p className="text-caption text-ash">No backups recorded yet.</p>
                  </div>
                ) : (
                  <StatusMixBar counts={counts} total={list.length} />
                )}
              </div>
            </Card>

            <Card className="lg:col-span-7 p-0 overflow-hidden">
              <div className="border-b border-hairline-soft p-6 lg:p-8 flex items-start justify-between gap-4">
                <div>
                  <Eyebrow>Volume · last 14 days</Eyebrow>
                  <p className="text-heading-sm text-on-primary mt-1">Backup runs per day</p>
                </div>
                <Badge variant="mono">
                  <TrendingUp className="size-2.5" /> Stacked
                </Badge>
              </div>
              <div className="p-6 lg:p-8">
                {isLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  <VolumeChart series={volumeSeries} />
                )}
              </div>
            </Card>
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="border-b border-hairline-soft p-6 lg:p-8 flex items-start justify-between gap-4">
              <div>
                <Eyebrow>Top databases · by archived bytes</Eyebrow>
                <p className="text-heading-sm text-on-primary mt-1">Largest contributors</p>
              </div>
              {inFlight > 0 && (
                <Badge variant="info">
                  <Loader2 className="size-2.5 animate-spin" /> {inFlight} live
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
                <TopDatabasesPanel backups={list} databaseNames={dbNameMap} />
              )}
            </div>
          </Card>
        </section>

        {/* Existing roster */}
        <section className="space-y-4">
          <SectionRule label="03 · Roster" />
          <BackupList />
        </section>
      </div>
    </AppLayout>
  );
}
