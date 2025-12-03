import { useAuth } from "@/components/auth-provider";
import { DashboardNav } from "@/components/dashboard-nav";
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { Database } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const { isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Determine current tab based on route path
  const getCurrentTab = () => {
    const path = location.pathname;
    if (path === "/dashboard" || path === "/dashboard/") return "overview";
    return "overview";
  };

  const currentTab = getCurrentTab();

  useEffect(() => {
    if (!isAuthenticated) {
      // router.push("/login");
    }
  }, [isAuthenticated]);

  const handleLogout = () => {
    logout();
    toast.info("Logged out successfully");
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    // Trigger a page refresh or refetch
    window.location.reload();
  };

  const handleTabChange = (_tab: string) => {
    // Navigation is handled by DashboardNav now
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-linear-to-r from-primary/5 via-primary/10 to-primary/5 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary text-primary-foreground p-2.5 rounded-xl shadow-lg">
                <Database className="h-6 w-6" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-xl font-bold bg-linear-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  DumpStation
                </h1>
                <p className="text-sm text-muted-foreground">
                  PostgreSQL Backup Service
                </p>
              </div>
            </div>

            <DashboardNav
              currentTab={currentTab}
              onTabChange={handleTabChange}
              onRefresh={handleRefresh}
              onLogout={handleLogout}
              isRefreshing={isRefreshing}
            />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
