import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserInitials, useUserAvatar, useUserProfile } from "@/lib/api/user";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, Settings, Palette, Sun, Moon, Monitor } from "lucide-react";

interface UserMenuProps {
  onLogout?: () => void;
  className?: string;
}

export function UserMenu({ onLogout, className }: UserMenuProps) {
  const navigate = useNavigate();
  const { data: user, isLoading } = useUserProfile();
  const { data: avatarUrl } = useUserAvatar(user?.has_profile_picture);
  const { theme, setTheme } = useTheme();

  const handleSettingsClick = () => {
    navigate({ to: "/settings" });
  };

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    }
  };

  const initials = getUserInitials(user?.discord_username, user?.email);

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Skeleton className="h-9 w-9 rounded-full" />
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 rounded-full p-0.5 transition-all",
            "hover:ring-2 hover:ring-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/40",
            className
          )}
          aria-label="User menu"
        >
          <Avatar className="h-9 w-9 cursor-pointer">
            <AvatarImage
              src={avatarUrl || undefined}
              alt={user?.discord_username || "User"}
            />
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="end" sideOffset={8}>
        {/* User Info Header */}
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-3 py-1">
            <Avatar className="h-10 w-10">
              <AvatarImage
                src={avatarUrl || undefined}
                alt={user?.discord_username || "User"}
              />
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col space-y-0.5 overflow-hidden">
              <p className="text-sm font-medium leading-none truncate">
                {user?.discord_username || "User"}
              </p>
              <p className="text-xs text-muted-foreground leading-none truncate">
                {user?.email || "No email"}
              </p>
              {user?.is_demo && (
                <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400 w-fit">
                  Demo Account
                </span>
              )}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Menu Items */}
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={handleSettingsClick}
            className="cursor-pointer"
          >
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
              <Palette className="mr-2 h-4 w-4" />
              <span>Theme</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onClick={() => setTheme("light")}
                className="cursor-pointer"
              >
                <Sun className="mr-2 h-4 w-4" />
                <span>Light</span>
                {theme === "light" && (
                  <span className="ml-auto text-xs">✓</span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setTheme("dark")}
                className="cursor-pointer"
              >
                <Moon className="mr-2 h-4 w-4" />
                <span>Dark</span>
                {theme === "dark" && <span className="ml-auto text-xs">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setTheme("system")}
                className="cursor-pointer"
              >
                <Monitor className="mr-2 h-4 w-4" />
                <span>System</span>
                {theme === "system" && (
                  <span className="ml-auto text-xs">✓</span>
                )}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/* Logout */}
        <DropdownMenuItem
          onClick={handleLogout}
          variant="destructive"
          className="cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
