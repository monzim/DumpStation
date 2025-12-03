import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Archive,
  Bell,
  Database,
  HardDrive,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  X,
} from "lucide-react";
import { useState } from "react";

interface NavItem {
  label: string;
  value: string;
  icon: React.ElementType;
  route: string;
}

const navItems: NavItem[] = [
  {
    label: "Overview",
    value: "overview",
    icon: LayoutDashboard,
    route: "/dashboard",
  },
  {
    label: "Databases",
    value: "databases",
    icon: Database,
    route: "/databases",
  },
  {
    label: "Backups",
    value: "backups",
    icon: Archive,
    route: "/backups",
  },
  {
    label: "Activity",
    value: "logs",
    icon: Activity,
    route: "/activity",
  },
  {
    label: "Notifications",
    value: "notifications",
    icon: Bell,
    route: "/notifications",
  },
  {
    label: "Storage",
    value: "storage",
    icon: HardDrive,
    route: "/storage",
  },
];

interface DashboardNavProps {
  currentTab: string;
  onTabChange: (value: string) => void;
  onRefresh?: () => void;
  onLogout?: () => void;
  isRefreshing?: boolean;
}

export function DashboardNav({
  currentTab,
  onTabChange,
  onRefresh,
  onLogout,
  isRefreshing,
}: DashboardNavProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleNavClick = (item: NavItem) => {
    navigate({ to: item.route });
    onTabChange(item.value);
    setOpen(false);
  };

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh();
    }
    setOpen(false);
  };

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    }
    setOpen(false);
  };

  return (
    <>
      {/* Desktop Navigation - Clean pill-style tabs */}
      <nav className="hidden md:flex items-center gap-1 bg-muted/40 p-1 rounded-full">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.value;
          return (
            <button
              key={item.value}
              onClick={() => handleNavClick(item)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200",
                "hover:bg-background/60",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden lg:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Mobile Navigation - Bottom sheet with modern design */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild className="md:hidden">
          <Button
            variant="outline"
            size="icon"
            className="relative rounded-full"
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-[280px] p-0 flex flex-col"
          closeButton={false}
        >
          {/* Mobile header */}
          <div className="flex items-center justify-between p-6 border-b">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-base">DumpStation</h2>
                <p className="text-xs text-muted-foreground">
                  Database Backups
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              className="rounded-full h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Navigation items */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.value;
                return (
                  <button
                    key={item.value}
                    onClick={() => handleNavClick(item)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Actions section */}
            {(onRefresh || onLogout) && (
              <>
                <Separator className="my-4" />
                <div className="space-y-1">
                  {onRefresh && (
                    <button
                      onClick={handleRefresh}
                      disabled={isRefreshing}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                        "text-muted-foreground hover:bg-muted hover:text-foreground",
                        isRefreshing && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <RefreshCw
                        className={cn(
                          "h-5 w-5 shrink-0",
                          isRefreshing && "animate-spin"
                        )}
                      />
                      <span>Refresh Stats</span>
                    </button>
                  )}
                  {onLogout && (
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-destructive hover:bg-destructive/10"
                    >
                      <LogOut className="h-5 w-5 shrink-0" />
                      <span>Logout</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Mobile footer with version/info */}
          <div className="border-t p-4">
            <div className="text-xs text-muted-foreground text-center">
              <p className="font-medium">DumpStation v1.0</p>
              <p className="mt-1">PostgreSQL Backup Service</p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
