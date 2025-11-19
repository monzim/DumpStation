import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Activity,
  Archive,
  Bell,
  Database,
  HardDrive,
  LayoutDashboard,
  Menu,
} from "lucide-react";
import { useState } from "react";

interface NavItem {
  label: string;
  value: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { label: "Overview", value: "overview", icon: LayoutDashboard },
  { label: "Databases", value: "databases", icon: Database },
  { label: "Backups", value: "backups", icon: Archive },
  { label: "Activity Logs", value: "logs", icon: Activity },
  { label: "Notifications", value: "notifications", icon: Bell },
  { label: "Storage", value: "storage", icon: HardDrive },
];

interface DashboardNavProps {
  currentTab: string;
  onTabChange: (value: string) => void;
}

export function DashboardNav({ currentTab, onTabChange }: DashboardNavProps) {
  const [open, setOpen] = useState(false);

  const handleNavClick = (value: string) => {
    onTabChange(value);
    setOpen(false);
  };

  return (
    <>
      {/* Desktop Navigation */}
      <nav className="hidden lg:flex items-center gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.value}
              variant={currentTab === item.value ? "default" : "ghost"}
              onClick={() => onTabChange(item.value)}
              className="gap-2"
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Button>
          );
        })}
      </nav>

      {/* Mobile Navigation */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild className="lg:hidden">
          <Button variant="outline" size="icon">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64">
          <div className="flex flex-col gap-4 mt-8">
            <div className="px-3 py-2">
              <h2 className="mb-2 text-lg font-semibold">Navigation</h2>
              <div className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Button
                      key={item.value}
                      variant={currentTab === item.value ? "default" : "ghost"}
                      onClick={() => handleNavClick(item.value)}
                      className="w-full justify-start gap-2"
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
