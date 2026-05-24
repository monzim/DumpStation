import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { UserMenu } from "@/components/user-menu";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Archive,
  Bell,
  ChevronDown,
  Database,
  HardDrive,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Server,
  Settings,
  Tags,
  X,
} from "lucide-react";
import { useState } from "react";

interface NavItem {
  label: string;
  value: string;
  icon: React.ElementType;
  route: string;
}

// Primary nav — always visible on desktop.
const primaryItems: NavItem[] = [
  { label: "Overview", value: "overview", icon: LayoutDashboard, route: "/dashboard" },
  { label: "Databases", value: "databases", icon: Database, route: "/databases" },
  { label: "DB Servers", value: "db-servers", icon: Server, route: "/db-servers" },
  { label: "Backups", value: "backups", icon: Archive, route: "/backups" },
  { label: "Activity", value: "logs", icon: Activity, route: "/activity" },
];

// Secondary nav — collapsed into a "More" dropdown on desktop, kept
// inline on mobile (where a vertical list has space).
const secondaryItems: NavItem[] = [
  { label: "Labels", value: "labels", icon: Tags, route: "/labels" },
  { label: "Notifications", value: "notifications", icon: Bell, route: "/notifications" },
  { label: "Storage", value: "storage", icon: HardDrive, route: "/storage" },
];

const allItems = [...primaryItems, ...secondaryItems];

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
    if (onRefresh) onRefresh();
    setOpen(false);
  };

  const handleLogout = () => {
    if (onLogout) onLogout();
    setOpen(false);
  };

  const isSecondaryActive = secondaryItems.some((i) => i.value === currentTab);
  const activeSecondaryLabel =
    secondaryItems.find((i) => i.value === currentTab)?.label ?? "More";

  return (
    <>
      {/* Desktop nav — primary pills + a "More" dropdown for the rest */}
      <div className="hidden md:flex items-center gap-3">
        <nav className="flex items-center gap-0.5 bg-muted/40 p-1 rounded-full">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.value;
            return (
              <button
                key={item.value}
                onClick={() => handleNavClick(item)}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden lg:inline">{item.label}</span>
              </button>
            );
          })}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                  isSecondaryActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                )}
              >
                <span className="hidden lg:inline">{activeSecondaryLabel}</span>
                <span className="lg:hidden">More</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              {secondaryItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.value;
                return (
                  <DropdownMenuItem
                    key={item.value}
                    onClick={() => handleNavClick(item)}
                    className={cn("gap-2.5 cursor-pointer", isActive && "bg-muted")}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span>{item.label}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <UserMenu onLogout={onLogout} />
      </div>

      {/* Mobile nav — full list in a left sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild className="md:hidden">
          <Button variant="outline" size="icon" className="relative rounded-full">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-[280px] p-0 flex flex-col"
          closeButton={false}
        >
          <div className="flex items-center justify-between p-6 border-b">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-base">DumpStation</h2>
                <p className="text-xs text-muted-foreground">Database Backups</p>
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

          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-1">
              {allItems.map((item) => {
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

            {(onRefresh || onLogout) && (
              <>
                <Separator className="my-4" />
                <div className="space-y-1">
                  <button
                    onClick={() => {
                      navigate({ to: "/settings" });
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                      currentTab === "settings"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Settings className="h-5 w-5 shrink-0" />
                    <span>Settings</span>
                  </button>
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
                        className={cn("h-5 w-5 shrink-0", isRefreshing && "animate-spin")}
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
                      <span>Sign out</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

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
