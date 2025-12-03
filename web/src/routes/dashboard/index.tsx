import { RecentActivity } from "@/components/recent-activity";
import { StatsCard } from "@/components/stats-card";
import { Button } from "@/components/ui/button";
import { useSystemStats } from "@/lib/api/stats";
import { formatBytes, formatPercentage } from "@/lib/utils/format";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  CheckCircle2,
  Database,
  HardDrive,
  RefreshCw,
  XCircle,
} from "lucide-react";

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
      {
        name: "robots",
        content: "noindex, nofollow",
      },
      {
        property: "og:title",
        content: "Dashboard - DumpStation",
      },
      {
        property: "og:description",
        content:
          "Monitor and manage your PostgreSQL database backups in real-time.",
      },
      {
        property: "og:url",
        content: "https://dumpstation.io/dashboard",
      },
      {
        name: "twitter:title",
        content: "Dashboard - DumpStation",
      },
      {
        name: "twitter:description",
        content:
          "Monitor and manage your PostgreSQL database backups in real-time.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://dumpstation.io/dashboard",
      },
    ],
  }),
});

function OverviewPage() {
  const navigate = useNavigate();
  const {
    data: stats,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useSystemStats();

  const handleRefresh = () => {
    refetch();
  };

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <XCircle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-2xl font-bold">Failed to load statistics</h1>
          <p className="text-muted-foreground">
            {(error as { message?: string }).message || "An error occurred"}
          </p>
          <Button onClick={handleRefresh}>Try Again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Overview Section */}
      <div>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">System Overview</h2>
            <p className="text-muted-foreground mt-1">
              Monitor your backup infrastructure
            </p>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={isRefetching}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <StatsCard
            title="Total Databases"
            value={stats?.total_databases ?? 0}
            icon={Database}
            description="Active database configurations"
            isLoading={isLoading}
          />
          <StatsCard
            title="Backups (24h)"
            value={stats?.total_backups_24h ?? 0}
            icon={Archive}
            description="Backups in the last 24 hours"
            isLoading={isLoading}
          />
          <StatsCard
            title="Storage Used"
            value={
              stats ? formatBytes(stats.total_storage_used_bytes) : "0 Bytes"
            }
            icon={HardDrive}
            description="Total backup storage consumed"
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Performance Section */}
      <div>
        <div className="mb-6">
          <h2 className="text-3xl font-bold">Performance Metrics</h2>
          <p className="text-muted-foreground mt-1">
            Track backup success rates
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <StatsCard
            title="Success Rate"
            value={stats ? formatPercentage(stats.success_rate_24h) : "0%"}
            icon={CheckCircle2}
            description="Successful backups in last 24h"
            isLoading={isLoading}
          />
          <StatsCard
            title="Failure Rate"
            value={stats ? formatPercentage(stats.failure_rate_24h) : "0%"}
            icon={XCircle}
            description="Failed backups in last 24h"
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Recent Activity Section */}
      <div>
        <RecentActivity onViewAll={() => navigate({ to: "/activity" })} />
      </div>
    </div>
  );
}
