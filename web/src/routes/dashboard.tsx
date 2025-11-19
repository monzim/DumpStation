import { ActivityLogList } from "@/components/activity-log-list";
import { useAuth } from "@/components/auth-provider";
import { BackupList } from "@/components/backup-list";
import { DashboardNav } from "@/components/dashboard-nav";
import { DatabaseList } from "@/components/database-list";
import { NotificationList } from "@/components/notification-list";
import { RecentActivity } from "@/components/recent-activity";
import { StatsCard } from "@/components/stats-card";
import { StorageList } from "@/components/storage-list";
import { Button } from "@/components/ui/button";
import { useSystemStats } from "@/lib/api/stats";
import { formatBytes, formatPercentage } from "@/lib/utils/format";
import { createFileRoute } from "@tanstack/react-router";
import {
  Archive,
  CheckCircle2,
  Database,
  HardDrive,
  LogOut,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  component: RouteComponent,
});

function RouteComponent() {
  const { isAuthenticated, logout } = useAuth();
  const {
    data: stats,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useSystemStats();
  const [currentTab, setCurrentTab] = useState("overview");

  useEffect(() => {
    if (!isAuthenticated) {
      //   router.push("/login");
    }
  }, [isAuthenticated]);

  const handleLogout = () => {
    logout();
    toast.info("Logged out successfully");
  };

  const handleRefresh = () => {
    refetch();
    toast.success("Statistics refreshed");
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
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
    <div className="min-h-screen bg-background">
      <header className="border-b bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary text-primary-foreground p-2.5 rounded-xl shadow-lg">
                <Database className="h-6 w-6" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  PostgreSQL Backup
                </h1>
                <p className="text-sm text-muted-foreground">
                  Manage your backups
                </p>
              </div>
            </div>

            <DashboardNav currentTab={currentTab} onTabChange={setCurrentTab} />

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefetching}
                className="hidden sm:flex"
              >
                <RefreshCw
                  className={`h-4 w-4 sm:mr-2 ${isRefetching ? "animate-spin" : ""}`}
                />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {currentTab === "overview" && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Overview Section */}
            <div>
              <div className="mb-6">
                <h2 className="text-3xl font-bold">System Overview</h2>
                <p className="text-muted-foreground mt-1">
                  Monitor your backup infrastructure
                </p>
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
                    stats
                      ? formatBytes(stats.total_storage_used_bytes)
                      : "0 Bytes"
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
                  value={
                    stats ? formatPercentage(stats.success_rate_24h) : "0%"
                  }
                  icon={CheckCircle2}
                  description="Successful backups in last 24h"
                  isLoading={isLoading}
                />
                <StatsCard
                  title="Failure Rate"
                  value={
                    stats ? formatPercentage(stats.failure_rate_24h) : "0%"
                  }
                  icon={XCircle}
                  description="Failed backups in last 24h"
                  isLoading={isLoading}
                />
              </div>
            </div>

            {/* Recent Activity Section */}
            <div>
              <RecentActivity onViewAll={() => setCurrentTab("logs")} />
            </div>
          </div>
        )}

        {currentTab === "databases" && (
          <div className="animate-in fade-in duration-300">
            <DatabaseList />
          </div>
        )}

        {currentTab === "backups" && (
          <div className="animate-in fade-in duration-300">
            <BackupList />
          </div>
        )}

        {currentTab === "notifications" && (
          <div className="animate-in fade-in duration-300">
            <NotificationList />
          </div>
        )}

        {currentTab === "logs" && (
          <div className="animate-in fade-in duration-300">
            <ActivityLogList />
          </div>
        )}

        {currentTab === "storage" && (
          <div className="animate-in fade-in duration-300">
            <StorageList />
          </div>
        )}
      </main>
    </div>
  );
}
