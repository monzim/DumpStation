import { AppLayout } from "@/components/app-layout";
import { StorageList } from "@/components/storage-list";
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
import { useStorageConfigs } from "@/lib/api/storage";
import type { Backup, DatabaseConfig, StorageConfig } from "@/lib/types/api";
import { formatBytes } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  Cloud,
  Database,
  Globe,
  HardDrive,
  Link2,
  Link2Off,
  PackageOpen,
  Server,
} from "lucide-react";
import { useMemo } from "react";

export const Route = createFileRoute("/storage")({
  component: StoragePage,
  head: () => ({
    meta: [
      { title: "Storage - DumpStation" },
      {
        name: "description",
        content:
          "Manage storage configurations for your PostgreSQL database backups.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Storage - DumpStation" },
      {
        property: "og:description",
        content:
          "Manage storage configurations for your PostgreSQL database backups.",
      },
      {
        property: "og:url",
        content: "https://dumpstation.monzim.com/storage",
      },
      { name: "twitter:title", content: "Storage - DumpStation" },
      {
        name: "twitter:description",
        content:
          "Manage storage configurations for your PostgreSQL database backups.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://dumpstation.monzim.com/storage",
      },
    ],
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Bucket aggregation
// ─────────────────────────────────────────────────────────────────────────────

type BucketStat = {
  storage: StorageConfig;
  bytes: number;
  artifacts: number;
  linkedDbs: number;
  lastTs: number;
};

function aggregateBuckets(
  storages: StorageConfig[],
  databases: DatabaseConfig[],
  backups: Backup[],
): BucketStat[] {
  const dbToStorage = new Map<string, string>(
    databases.map((d) => [d.id, d.storage_id]),
  );
  const linkCount = new Map<string, number>();
  for (const d of databases) {
    linkCount.set(d.storage_id, (linkCount.get(d.storage_id) ?? 0) + 1);
  }

  const usage = new Map<string, { bytes: number; artifacts: number; lastTs: number }>();
  for (const b of backups) {
    if (b.status !== "success" || !b.size_bytes) continue;
    const sid = dbToStorage.get(b.database_id);
    if (!sid) continue;
    const cur = usage.get(sid) ?? { bytes: 0, artifacts: 0, lastTs: 0 };
    cur.bytes += b.size_bytes;
    cur.artifacts += 1;
    const ts = new Date(b.timestamp).getTime();
    if (ts > cur.lastTs) cur.lastTs = ts;
    usage.set(sid, cur);
  }

  return storages
    .map((s) => ({
      storage: s,
      bytes: usage.get(s.id)?.bytes ?? 0,
      artifacts: usage.get(s.id)?.artifacts ?? 0,
      linkedDbs: linkCount.get(s.id) ?? 0,
      lastTs: usage.get(s.id)?.lastTs ?? 0,
    }))
    .sort((a, b) => b.bytes - a.bytes);
}

// ─────────────────────────────────────────────────────────────────────────────
// Visualizations
// ─────────────────────────────────────────────────────────────────────────────

function ProviderMix({ storages }: { storages: StorageConfig[] }) {
  const r2 = storages.filter((s) => s.provider === "r2").length;
  const s3 = storages.filter((s) => s.provider === "s3").length;
  const total = storages.length;
  const safe = Math.max(1, total);

  const r2Pct = (r2 / safe) * 100;
  const s3Pct = (s3 / safe) * 100;

  return (
    <div className="space-y-4">
      <div className="flex h-3 w-full rounded-full overflow-hidden border border-hairline-soft bg-canvas-soft">
        <div
          className="bg-link-blue-soft transition-all duration-500"
          style={{ width: `${r2Pct}%` }}
          title={`R2: ${r2}`}
        />
        <div
          className="bg-brand transition-all duration-500"
          style={{ width: `${s3Pct}%` }}
          title={`S3: ${s3}`}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <span className="inline-block size-2 rounded-full bg-link-blue-soft" />
          <p className="text-heading-sm tabular-nums text-on-primary">{r2}</p>
          <p className="text-mono-caps uppercase text-mute">
            Cloudflare R2 · {r2Pct.toFixed(0)}%
          </p>
        </div>
        <div className="space-y-1">
          <span className="inline-block size-2 rounded-full bg-brand" />
          <p className="text-heading-sm tabular-nums text-on-primary">{s3}</p>
          <p className="text-mono-caps uppercase text-mute">
            AWS S3 · {s3Pct.toFixed(0)}%
          </p>
        </div>
      </div>
    </div>
  );
}

function LinkageMix({ buckets }: { buckets: BucketStat[] }) {
  const active = buckets.filter((b) => b.linkedDbs > 0).length;
  const orphan = buckets.filter((b) => b.linkedDbs === 0).length;
  const total = buckets.length;
  const safe = Math.max(1, total);

  const activePct = (active / safe) * 100;
  const orphanPct = (orphan / safe) * 100;

  return (
    <div className="space-y-4">
      <div className="flex h-3 w-full rounded-full overflow-hidden border border-hairline-soft bg-canvas-soft">
        <div
          className="bg-success transition-all duration-500"
          style={{ width: `${activePct}%` }}
        />
        <div
          className="bg-mute transition-all duration-500"
          style={{ width: `${orphanPct}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-start gap-2">
          <Link2 className="size-3.5 mt-1 text-success shrink-0" />
          <div>
            <p className="text-heading-sm tabular-nums text-success">{active}</p>
            <p className="text-mono-caps uppercase text-mute">
              Linked · {activePct.toFixed(0)}%
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Link2Off className="size-3.5 mt-1 text-mute shrink-0" />
          <div>
            <p className="text-heading-sm tabular-nums text-mute">{orphan}</p>
            <p className="text-mono-caps uppercase text-mute">
              Orphan · {orphanPct.toFixed(0)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BucketLedger({ buckets }: { buckets: BucketStat[] }) {
  if (buckets.length === 0) {
    return (
      <div className="text-center py-6 space-y-2">
        <PackageOpen className="size-7 mx-auto text-ash" />
        <p className="text-caption text-ash">No buckets configured yet.</p>
      </div>
    );
  }
  const max = Math.max(1, ...buckets.map((b) => b.bytes));
  const totalBytes = buckets.reduce((acc, b) => acc + b.bytes, 0);

  return (
    <div className="space-y-1">
      {/* desktop column header */}
      <div className="hidden lg:grid grid-cols-[1.6fr_0.6fr_1fr_1fr_0.8fr] gap-4 pb-3 mb-1 border-b border-hairline-soft text-mono-micro uppercase text-mute">
        <span>Bucket</span>
        <span>Provider</span>
        <span>Stored bytes</span>
        <span>Distribution</span>
        <span className="text-right">Linked</span>
      </div>

      {buckets.map((b, i) => {
        const pct = (b.bytes / max) * 100;
        const sharePct = totalBytes > 0 ? (b.bytes / totalBytes) * 100 : 0;
        return (
          <div
            key={b.storage.id}
            className="grid lg:grid-cols-[1.6fr_0.6fr_1fr_1fr_0.8fr] grid-cols-1 gap-4 py-4 border-b border-hairline-soft last:border-0 hover:bg-canvas-soft/40 transition-colors"
          >
            {/* Name + region */}
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-mono-micro uppercase text-mute font-mono tabular-nums shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="size-8 rounded-app-sm bg-canvas-soft border border-hairline-soft flex items-center justify-center shrink-0">
                {b.storage.provider === "r2" ? (
                  <Cloud className="size-4 text-link-blue-soft" />
                ) : (
                  <HardDrive className="size-4 text-brand" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-body-sm font-medium text-on-primary truncate">
                  {b.storage.name}
                </p>
                <p className="text-mono-micro uppercase text-mute truncate">
                  {b.storage.bucket}
                  {b.storage.region ? ` · ${b.storage.region}` : ""}
                </p>
              </div>
            </div>

            {/* Provider */}
            <div className="flex items-center">
              <Badge
                variant={b.storage.provider === "r2" ? "info" : "mono"}
                className={b.storage.provider === "s3" ? "text-brand border-brand/40" : undefined}
              >
                {b.storage.provider === "r2" ? "R2" : "S3"}
              </Badge>
            </div>

            {/* Bytes */}
            <div className="space-y-1">
              <p className="text-body-sm tabular-nums text-on-primary">
                {b.bytes > 0 ? formatBytes(b.bytes) : "—"}
              </p>
              <p className="text-mono-micro uppercase text-mute">
                {b.artifacts} object{b.artifacts === 1 ? "" : "s"} ·{" "}
                {sharePct.toFixed(1)}% of total
              </p>
            </div>

            {/* Distribution bar */}
            <div className="flex items-center">
              <div className="h-1.5 w-full bg-graphite/60 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    b.storage.provider === "r2" ? "bg-link-blue-soft" : "bg-brand",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {/* Linked databases + last-write */}
            <div className="lg:text-right space-y-0.5">
              <p
                className={cn(
                  "text-body-sm tabular-nums inline-flex items-center gap-1.5 lg:justify-end",
                  b.linkedDbs > 0 ? "text-on-primary" : "text-mute",
                )}
              >
                <Database className="size-3.5" />
                {b.linkedDbs}
              </p>
              <p className="text-mono-micro uppercase text-mute">
                {b.lastTs > 0
                  ? `last ${formatDistanceToNow(new Date(b.lastTs), { addSuffix: true })}`
                  : "no writes"}
              </p>
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

function StoragePage() {
  const { data: storages, isLoading } = useStorageConfigs();
  const { data: databases } = useDatabases();
  const { data: backups } = useBackups();
  const now = useNow();

  const list = storages ?? [];
  const dbs = databases ?? [];
  const bks = backups ?? [];

  const buckets = useMemo(
    () => aggregateBuckets(list, dbs, bks),
    [list, dbs, bks],
  );

  const totalBytes = buckets.reduce((acc, b) => acc + b.bytes, 0);
  const totalObjects = buckets.reduce((acc, b) => acc + b.artifacts, 0);
  const r2Count = list.filter((s) => s.provider === "r2").length;
  const s3Count = list.filter((s) => s.provider === "s3").length;
  const orphans = buckets.filter((b) => b.linkedDbs === 0).length;
  const active = list.length - orphans;
  const uniqueRegions = new Set(list.map((s) => s.region).filter(Boolean));

  return (
    <AppLayout>
      <div className="space-y-12 animate-in fade-in duration-500">
        <PageBriefing
          eyebrow={`Storage · Bucket registry · ${now.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}`}
          title="Backup"
          echo="targets."
          subtitle="S3 buckets, Cloudflare R2, and the volumes where DumpStation will ship every artifact it produces."
          ledger={[
            {
              label: "Live",
              value: (
                <span className="inline-flex items-center gap-2">
                  <LiveDot tone={orphans === 0 ? "success" : "warning"} />
                  {now.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  })}
                </span>
              ),
            },
            { label: "Buckets", value: list.length.toString() },
            { label: "Linked", value: `${active}/${list.length || 0}` },
          ]}
        />

        {/* KPI strip */}
        <section className="space-y-4">
          <SectionRule label="01 · Indicators" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiTile
              label="Total buckets"
              icon={HardDrive}
              value={list.length}
              hint={`${r2Count} R2 · ${s3Count} S3`}
              isLoading={isLoading}
            />
            <KpiTile
              label="Bytes archived"
              icon={PackageOpen}
              value={formatBytes(totalBytes)}
              hint={`${totalObjects.toLocaleString()} object${totalObjects === 1 ? "" : "s"}`}
              isLoading={isLoading}
            />
            <KpiTile
              label="Linked"
              icon={Link2}
              tone="success"
              value={`${active}/${list.length || 0}`}
              hint={`${orphans} orphan${orphans === 1 ? "" : "s"}`}
              isLoading={isLoading}
            />
            <KpiTile
              label="Regions"
              icon={Globe}
              value={uniqueRegions.size}
              hint={
                uniqueRegions.size === 0
                  ? "No region set"
                  : Array.from(uniqueRegions).slice(0, 2).join(" · ")
              }
              isLoading={isLoading}
            />
          </div>
        </section>

        {/* Snapshot */}
        <section className="space-y-4">
          <SectionRule label="02 · Distribution" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <Card className="lg:col-span-6 p-0 overflow-hidden">
              <div className="border-b border-hairline-soft p-6 lg:p-8">
                <Eyebrow>Provider mix</Eyebrow>
                <p className="text-heading-sm text-on-primary mt-1">R2 versus S3</p>
              </div>
              <div className="p-6 lg:p-8">
                {isLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : list.length === 0 ? (
                  <div className="text-center py-6 space-y-2">
                    <Cloud className="size-7 mx-auto text-ash" />
                    <p className="text-caption text-ash">
                      Add your first storage target to see provider mix.
                    </p>
                  </div>
                ) : (
                  <ProviderMix storages={list} />
                )}
              </div>
            </Card>

            <Card className="lg:col-span-6 p-0 overflow-hidden">
              <div className="border-b border-hairline-soft p-6 lg:p-8 flex items-start justify-between gap-4">
                <div>
                  <Eyebrow>Linkage</Eyebrow>
                  <p className="text-heading-sm text-on-primary mt-1">Buckets in active use</p>
                </div>
                {orphans > 0 && (
                  <Badge variant="warning">
                    <Link2Off className="size-2.5" /> {orphans} orphan
                  </Badge>
                )}
              </div>
              <div className="p-6 lg:p-8">
                {isLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : list.length === 0 ? (
                  <div className="text-center py-6 space-y-2">
                    <Link2 className="size-7 mx-auto text-ash" />
                    <p className="text-caption text-ash">No linkage data yet.</p>
                  </div>
                ) : (
                  <LinkageMix buckets={buckets} />
                )}
              </div>
            </Card>
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="border-b border-hairline-soft p-6 lg:p-8 flex items-start justify-between gap-4">
              <div>
                <Eyebrow>Bucket ledger</Eyebrow>
                <p className="text-heading-sm text-on-primary mt-1">
                  Utilization ranked by stored bytes
                </p>
              </div>
              <Badge variant="mono">
                <Server className="size-2.5" /> {buckets.length}
              </Badge>
            </div>
            <div className="p-6 lg:p-8">
              {isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <BucketLedger buckets={buckets} />
              )}
            </div>
          </Card>
        </section>

        {/* Existing roster */}
        <section className="space-y-4">
          <SectionRule label="03 · Management" />
          <StorageList />
        </section>
      </div>
    </AppLayout>
  );
}
