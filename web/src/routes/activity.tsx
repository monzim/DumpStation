import { ActivityLogList } from "@/components/activity-log-list";
import { AppLayout } from "@/components/app-layout";
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
import { useActivityLogs } from "@/lib/api/logs";
import type { ActivityLog } from "@/lib/types/api";
import { cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Radio,
  TrendingUp,
  UserCircle,
} from "lucide-react";
import { useMemo } from "react";

export const Route = createFileRoute("/activity")({
  component: ActivityPage,
  head: () => ({
    meta: [
      { title: "Activity Logs - DumpStation" },
      {
        name: "description",
        content:
          "View activity logs and audit trail for your PostgreSQL backup operations.",
      },
      {
        name: "robots",
        content: "noindex, nofollow",
      },
      {
        property: "og:title",
        content: "Activity Logs - DumpStation",
      },
      {
        property: "og:description",
        content:
          "View activity logs and audit trail for your PostgreSQL backup operations.",
      },
      {
        property: "og:url",
        content: "https://dumpstation.monzim.com/activity",
      },
      {
        name: "twitter:title",
        content: "Activity Logs - DumpStation",
      },
      {
        name: "twitter:description",
        content:
          "View activity logs and audit trail for your PostgreSQL backup operations.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://dumpstation.monzim.com/activity",
      },
    ],
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type HourBucket = { hour: Date; total: number; info: number; success: number; warning: number; error: number };

function startOfHourLocal(d: Date) {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  return x;
}

function buildHourBuckets(logs: ActivityLog[], hours = 24): HourBucket[] {
  const now = new Date();
  const start = startOfHourLocal(new Date(now.getTime() - (hours - 1) * 3600_000));
  const cells: HourBucket[] = Array.from({ length: hours }, (_, i) => ({
    hour: new Date(start.getTime() + i * 3600_000),
    total: 0,
    info: 0,
    success: 0,
    warning: 0,
    error: 0,
  }));
  for (const log of logs) {
    const t = startOfHourLocal(new Date(log.created_at)).getTime();
    const diff = Math.floor((t - start.getTime()) / 3600_000);
    if (diff < 0 || diff >= hours) continue;
    const cell = cells[diff];
    cell.total += 1;
    cell[log.level] += 1;
  }
  return cells;
}

const levelMeta: Record<
  ActivityLog["level"],
  { label: string; bar: string; text: string; Icon: React.ElementType }
> = {
  info: { label: "Info", bar: "bg-link-blue-soft", text: "text-link-blue-soft", Icon: Info },
  success: { label: "Success", bar: "bg-success", text: "text-success", Icon: CheckCircle2 },
  warning: { label: "Warning", bar: "bg-amber-400", text: "text-amber-400", Icon: AlertTriangle },
  error: { label: "Error", bar: "bg-error", text: "text-error", Icon: AlertCircle },
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
  notification_updated: "Notification updated",
  notification_deleted: "Notification removed",
  login: "User signed in",
  logout: "User signed out",
  restore_triggered: "Restore initiated",
  restore_completed: "Restore completed",
  restore_failed: "Restore failed",
  failed_backups_purged: "Failed backups purged",
  backup_download_otp_requested: "Download OTP requested",
  backup_downloaded: "Backup downloaded",
  session_refreshed: "Session refreshed",
  "2fa_setup_started": "2FA setup started",
  "2fa_enabled": "2FA enabled",
  "2fa_verified": "2FA verified",
  "2fa_verification_failed": "2FA verification failed",
};

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

function HourlyActivityChart({ buckets }: { buckets: HourBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.total));
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-px h-24">
        {buckets.map((b, i) => {
          const heightPct = (b.total / max) * 100;
          const isNow = i === buckets.length - 1;
          return (
            <div
              key={i}
              title={`${b.hour.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })} · ${b.total} event${b.total === 1 ? "" : "s"}`}
              className="group flex-1 h-full flex flex-col justify-end items-stretch relative"
            >
              {b.total > 0 ? (
                <div className="flex flex-col-reverse h-full">
                  <div
                    className="bg-success/80 group-hover:bg-success transition-colors"
                    style={{
                      height: `${(b.success / b.total) * heightPct}%`,
                      minHeight: b.success ? "2px" : 0,
                    }}
                  />
                  <div
                    className="bg-link-blue-soft/70 group-hover:bg-link-blue-soft transition-colors"
                    style={{
                      height: `${(b.info / b.total) * heightPct}%`,
                      minHeight: b.info ? "2px" : 0,
                    }}
                  />
                  <div
                    className="bg-amber-400/80 group-hover:bg-amber-400 transition-colors"
                    style={{
                      height: `${(b.warning / b.total) * heightPct}%`,
                      minHeight: b.warning ? "2px" : 0,
                    }}
                  />
                  <div
                    className="bg-error/80 group-hover:bg-error transition-colors"
                    style={{
                      height: `${(b.error / b.total) * heightPct}%`,
                      minHeight: b.error ? "2px" : 0,
                    }}
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
  );
}

function LevelMix({
  counts,
}: {
  counts: Record<ActivityLog["level"], number>;
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const safe = Math.max(1, total);
  const order: ActivityLog["level"][] = ["success", "info", "warning", "error"];
  return (
    <div className="space-y-4">
      <div className="flex h-3 w-full rounded-full overflow-hidden border border-hairline-soft bg-canvas-soft">
        {order.map((k) => {
          const pct = (counts[k] / safe) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={k}
              className={cn("h-full transition-all duration-500", levelMeta[k].bar)}
              style={{ width: `${pct}%` }}
              title={`${levelMeta[k].label}: ${counts[k]}`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {order.map((k) => {
          const { Icon } = levelMeta[k];
          return (
            <div key={k} className="flex items-start gap-2">
              <Icon className={cn("size-3.5 mt-1 shrink-0", levelMeta[k].text)} />
              <div className="min-w-0">
                <p className={cn("text-heading-sm tabular-nums", levelMeta[k].text)}>
                  {counts[k]}
                </p>
                <p className="text-mono-caps uppercase text-mute">
                  {levelMeta[k].label} · {((counts[k] / safe) * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TopActionsPanel({ logs }: { logs: ActivityLog[] }) {
  const ranked = useMemo(() => {
    const m = new Map<string, { count: number; latest: number; level: ActivityLog["level"] }>();
    for (const log of logs) {
      const cur = m.get(log.action) ?? { count: 0, latest: 0, level: log.level };
      cur.count += 1;
      const t = new Date(log.created_at).getTime();
      if (t > cur.latest) {
        cur.latest = t;
        cur.level = log.level;
      }
      m.set(log.action, cur);
    }
    return Array.from(m.entries())
      .map(([action, v]) => ({ action, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [logs]);

  const max = Math.max(1, ...ranked.map((r) => r.count));

  if (ranked.length === 0) {
    return (
      <div className="text-center py-6 space-y-2">
        <Activity className="size-7 mx-auto text-ash" />
        <p className="text-caption text-ash">No actions recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {ranked.map((row, i) => {
        const pct = (row.count / max) * 100;
        const meta = levelMeta[row.level];
        return (
          <div key={row.action} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2">
                <span className="text-mono-micro uppercase text-mute font-mono tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="text-body-sm text-on-primary truncate">
                  {actionLabels[row.action] ?? row.action.replace(/_/g, " ")}
                </p>
              </div>
              <p className={cn("text-mono-caps tabular-nums shrink-0", meta.text)}>
                {row.count}
              </p>
            </div>
            <div className="h-1 w-full bg-graphite/60 rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-700", meta.bar)}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-mono-micro uppercase text-mute">
              last {formatDistanceToNow(new Date(row.latest), { addSuffix: true })}
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

function ActivityPage() {
  // Pull a wider window for derivations — the list component pulls its own.
  const { data, isLoading } = useActivityLogs({ limit: 200 });
  const now = useNow();

  const logs = data?.logs ?? [];

  const cutoff24h = Date.now() - 24 * 3600_000;
  const logs24h = useMemo(
    () => logs.filter((l) => new Date(l.created_at).getTime() >= cutoff24h),
    [logs, cutoff24h],
  );

  const counts24h: Record<ActivityLog["level"], number> = useMemo(
    () => ({
      info: logs24h.filter((l) => l.level === "info").length,
      success: logs24h.filter((l) => l.level === "success").length,
      warning: logs24h.filter((l) => l.level === "warning").length,
      error: logs24h.filter((l) => l.level === "error").length,
    }),
    [logs24h],
  );

  const errors24h = counts24h.error;
  const warns24h = counts24h.warning;

  const topActor = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs24h) {
      if (!l.user?.discord_username) continue;
      m.set(l.user.discord_username, (m.get(l.user.discord_username) ?? 0) + 1);
    }
    const sorted = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    return sorted[0] ?? null;
  }, [logs24h]);

  const buckets = useMemo(() => buildHourBuckets(logs24h, 24), [logs24h]);

  return (
    <AppLayout>
      <div className="space-y-12 animate-in fade-in duration-500">
        <PageBriefing
          eyebrow={`Audit · Event ledger · ${now.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}`}
          title="Audit"
          echo="log."
          subtitle="Every backup, download, and admin action across this workspace — chronological, searchable, retained."
          ledger={[
            {
              label: "Live",
              value: (
                <span className="inline-flex items-center gap-2">
                  <LiveDot tone={errors24h === 0 ? "success" : errors24h < 3 ? "warning" : "danger"} />
                  {now.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  })}
                </span>
              ),
            },
            { label: "24h", value: `${logs24h.length} ev` },
            { label: "Errors", value: errors24h.toString() },
          ]}
        />

        {/* KPI strip */}
        <section className="space-y-4">
          <SectionRule label="01 · Indicators" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiTile
              label="Events · 24h"
              icon={Activity}
              value={logs24h.length}
              hint={`${(data?.total ?? 0).toLocaleString()} total in log`}
              isLoading={isLoading}
            />
            <KpiTile
              label="Errors · 24h"
              icon={AlertCircle}
              tone={errors24h > 0 ? "danger" : "default"}
              value={errors24h}
              hint={
                errors24h === 0
                  ? "All clear"
                  : `${((errors24h / Math.max(1, logs24h.length)) * 100).toFixed(1)}% of events`
              }
              isLoading={isLoading}
            />
            <KpiTile
              label="Warnings · 24h"
              icon={AlertTriangle}
              tone={warns24h > 0 ? "warning" : "default"}
              value={warns24h}
              hint={`${counts24h.success} success · ${counts24h.info} info`}
              isLoading={isLoading}
            />
            <KpiTile
              label="Top actor"
              icon={UserCircle}
              value={topActor ? topActor[0] : "—"}
              hint={topActor ? `${topActor[1]} action${topActor[1] === 1 ? "" : "s"} · 24h` : "No user activity"}
              isLoading={isLoading}
            />
          </div>
        </section>

        {/* Snapshot */}
        <section className="space-y-4">
          <SectionRule label="02 · Pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <Card className="lg:col-span-7 p-0 overflow-hidden">
              <div className="border-b border-hairline-soft p-6 lg:p-8 flex items-start justify-between gap-4">
                <div>
                  <Eyebrow>Hourly throughput · last 24h</Eyebrow>
                  <p className="text-heading-sm text-on-primary mt-1">Events per hour by level</p>
                </div>
                <Badge variant="mono">
                  <TrendingUp className="size-2.5" /> Stacked
                </Badge>
              </div>
              <div className="p-6 lg:p-8">
                {isLoading ? (
                  <Skeleton className="h-28 w-full" />
                ) : (
                  <HourlyActivityChart buckets={buckets} />
                )}
              </div>
            </Card>

            <Card className="lg:col-span-5 p-0 overflow-hidden">
              <div className="border-b border-hairline-soft p-6 lg:p-8 flex items-start justify-between gap-4">
                <div>
                  <Eyebrow>Level mix · 24h</Eyebrow>
                  <p className="text-heading-sm text-on-primary mt-1">Severity distribution</p>
                </div>
                <Badge variant={errors24h > 0 ? "error" : "success"}>
                  <Radio className="size-2.5" /> {errors24h === 0 ? "Steady" : "Alerts"}
                </Badge>
              </div>
              <div className="p-6 lg:p-8">
                {isLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : logs24h.length === 0 ? (
                  <div className="text-center py-6 space-y-2">
                    <Activity className="size-7 mx-auto text-ash" />
                    <p className="text-caption text-ash">No events in the last 24 hours.</p>
                  </div>
                ) : (
                  <LevelMix counts={counts24h} />
                )}
              </div>
            </Card>
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="border-b border-hairline-soft p-6 lg:p-8 flex items-start justify-between gap-4">
              <div>
                <Eyebrow>Top actions · 24h</Eyebrow>
                <p className="text-heading-sm text-on-primary mt-1">Most frequent events by type</p>
              </div>
            </div>
            <div className="p-6 lg:p-8">
              {isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <TopActionsPanel logs={logs24h} />
              )}
            </div>
          </Card>
        </section>

        {/* Existing list */}
        <section className="space-y-4">
          <SectionRule label="03 · Stream" />
          <ActivityLogList />
        </section>
      </div>
    </AppLayout>
  );
}
