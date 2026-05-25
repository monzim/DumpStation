import { useAuth } from "@/components/auth-provider";
import { DashboardNav } from "@/components/dashboard-nav";
import { AppFooter } from "@/components/app-footer";
import { Wordmark } from "@/components/ui/wordmark";
import { BrandDot } from "@/components/ui/brand-dot";
import { Button } from "@/components/ui/button";
import { AlertBanner } from "@/components/ui/alert-banner";
import { cn } from "@/lib/utils";
import { useLocation } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface AppLayoutProps {
  children: React.ReactNode;
  // When true, suppresses footer + main vertical padding so a page can own
  // the full viewport below the header — used by the no-scroll Situation Room.
  compact?: boolean;
}

export function AppLayout({ children, compact = false }: AppLayoutProps) {
  const { logout, isDemo } = useAuth();
  const location = useLocation();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const getCurrentTab = () => {
    const path = location.pathname;
    if (path.startsWith("/situation")) return "situation";
    if (path === "/dashboard" || path === "/dashboard/") return "overview";
    if (path.startsWith("/databases")) return "databases";
    if (path.startsWith("/db-servers")) return "db-servers";
    if (path.startsWith("/backups")) return "backups";
    if (path.startsWith("/activity")) return "logs";
    if (path.startsWith("/notifications")) return "notifications";
    if (path.startsWith("/storage")) return "storage";
    if (path.startsWith("/labels")) return "labels";
    if (path.startsWith("/settings")) return "settings";
    return "overview";
  };

  const currentTab = getCurrentTab();

  const handleLogout = () => {
    logout();
    toast.info("Logged out");
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-canvas text-on-primary flex flex-col">
      {isDemo && (
        <div className="bg-canvas border-b border-hairline-soft">
          <div className="container mx-auto max-w-[1640px] px-6 lg:px-12 py-3">
            <AlertBanner
              tone="info"
              icon={<BrandDot size="sm" />}
              title="Demo mode"
            >
              <p>
                You're viewing sample data. Create, update, and delete actions are
                disabled.
              </p>
            </AlertBanner>
          </div>
        </div>
      )}

      <header className="bg-canvas sticky top-0 z-50 border-b border-hairline-soft">
        <div className="container mx-auto max-w-[1640px] px-6 lg:px-12 h-16 flex items-center gap-4">
          <Wordmark size="md" to="/dashboard" />

          <div className="flex-1 flex justify-center">
            <DashboardNav
              currentTab={currentTab}
              onRefresh={handleRefresh}
              onLogout={handleLogout}
              isRefreshing={isRefreshing}
            />
          </div>

          <div className="hidden md:flex items-center gap-2">
            <Button
              variant="ghost-dark"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="Refresh"
            >
              <RefreshCw className={isRefreshing ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>
      </header>

      <main
        className={cn(
          "flex-1 container mx-auto max-w-[1640px] px-6 lg:px-12",
          compact ? "py-0" : "py-8 lg:py-12",
        )}
      >
        {children}
      </main>

      {!compact && <AppFooter />}
    </div>
  );
}
