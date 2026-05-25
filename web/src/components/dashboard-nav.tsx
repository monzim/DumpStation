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
import { Wordmark } from "@/components/ui/wordmark";
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
  Radar,
  Server,
  Settings,
  Tags,
} from "lucide-react";
import { useState } from "react";

interface NavItem {
  label: string;
  value: string;
  icon: React.ElementType;
  route: string;
}

const primaryItems: NavItem[] = [
  { label: "Situation", value: "situation", icon: Radar, route: "/situation" },
  { label: "Overview", value: "overview", icon: LayoutDashboard, route: "/dashboard" },
  { label: "Databases", value: "databases", icon: Database, route: "/databases" },
  { label: "DB Servers", value: "db-servers", icon: Server, route: "/db-servers" },
  { label: "Backups", value: "backups", icon: Archive, route: "/backups" },
  { label: "Activity", value: "logs", icon: Activity, route: "/activity" },
];

const secondaryItems: NavItem[] = [
  { label: "Labels", value: "labels", icon: Tags, route: "/labels" },
  { label: "Notifications", value: "notifications", icon: Bell, route: "/notifications" },
  { label: "Storage", value: "storage", icon: HardDrive, route: "/storage" },
];

const allItems = [...primaryItems, ...secondaryItems];

interface DashboardNavProps {
  currentTab: string;
  onRefresh?: () => void;
  onLogout?: () => void;
  isRefreshing?: boolean;
}

export function DashboardNav({
  currentTab,
  onRefresh,
  onLogout,
  isRefreshing,
}: DashboardNavProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleNavClick = (item: NavItem) => {
    navigate({ to: item.route });
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
      {/* Desktop nav — flat editorial link strip with underline-tab indicator */}
      <nav className="hidden md:flex items-center gap-1">
        {primaryItems.map((item) => {
          const isActive = currentTab === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => handleNavClick(item)}
              data-active={isActive || undefined}
              className={cn(
                "relative px-3 py-2 text-button-sm uppercase font-medium tracking-[0.04em] transition-colors",
                isActive ? "text-on-primary" : "text-ash hover:text-on-primary",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link-blue-soft focus-visible:ring-offset-2 focus-visible:ring-offset-canvas rounded-app-xs",
                isActive &&
                  "after:absolute after:left-2 after:right-2 after:-bottom-[18px] after:h-px after:bg-on-primary",
              )}
            >
              {item.label}
            </button>
          );
        })}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-active={isSecondaryActive || undefined}
              className={cn(
                "relative flex items-center gap-1 px-3 py-2 text-button-sm uppercase font-medium tracking-[0.04em] transition-colors",
                isSecondaryActive ? "text-on-primary" : "text-ash hover:text-on-primary",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link-blue-soft focus-visible:ring-offset-2 focus-visible:ring-offset-canvas rounded-app-xs",
                isSecondaryActive &&
                  "after:absolute after:left-2 after:right-6 after:-bottom-[18px] after:h-px after:bg-on-primary",
              )}
            >
              {isSecondaryActive ? activeSecondaryLabel : "More"}
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
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
                  className={cn(
                    "gap-2 cursor-pointer",
                    isActive && "bg-canvas text-on-primary",
                  )}
                >
                  <Icon className="size-4" />
                  <span>{item.label}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-4">
          <UserMenu onLogout={onLogout} />
        </div>
      </nav>

      {/* Mobile drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild className="md:hidden">
          <Button variant="ghost-dark" size="icon" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[300px] p-0 flex flex-col">
          <div className="p-6 border-b border-hairline-soft">
            <Wordmark size="lg" />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            {allItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => handleNavClick(item)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3 rounded-app-md text-button-lg font-medium transition-colors",
                    isActive
                      ? "bg-canvas-soft text-on-primary"
                      : "text-ash hover:bg-canvas-soft hover:text-on-primary",
                  )}
                >
                  <Icon className="size-5 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}

            <Separator className="my-4" />

            <button
              type="button"
              onClick={() => {
                navigate({ to: "/settings" });
                setOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-3 rounded-app-md text-button-lg font-medium transition-colors",
                currentTab === "settings"
                  ? "bg-canvas-soft text-on-primary"
                  : "text-ash hover:bg-canvas-soft hover:text-on-primary",
              )}
            >
              <Settings className="size-5 shrink-0" />
              <span>Settings</span>
            </button>

            {onRefresh && (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-app-md text-button-lg font-medium text-ash hover:bg-canvas-soft hover:text-on-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                <RefreshCw
                  className={cn("size-5 shrink-0", isRefreshing && "animate-spin")}
                />
                <span>Refresh</span>
              </button>
            )}

            {onLogout && (
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-app-md text-button-lg font-medium text-error hover:bg-error/10 transition-colors"
              >
                <LogOut className="size-5 shrink-0" />
                <span>Sign out</span>
              </button>
            )}
          </div>

          <div className="border-t border-hairline-soft p-4 text-mono-caps text-mute uppercase text-center">
            DumpStation · PostgreSQL Backup
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
