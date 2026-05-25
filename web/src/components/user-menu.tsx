import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserInitials, useUserAvatar, useUserProfile } from "@/lib/api/user";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, Settings } from "lucide-react";

interface UserMenuProps {
  onLogout?: () => void;
  className?: string;
}

export function UserMenu({ onLogout, className }: UserMenuProps) {
  const navigate = useNavigate();
  const { data: user, isLoading } = useUserProfile();
  const { data: avatarUrl } = useUserAvatar(user?.has_profile_picture);

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
          type="button"
          className={cn(
            "rounded-full p-0.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-link-blue-soft focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
            className,
          )}
          aria-label="User menu"
        >
          <Avatar className="size-9 cursor-pointer">
            <AvatarImage
              src={avatarUrl || undefined}
              alt={user?.discord_username || "User"}
            />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="end" sideOffset={8}>
        <DropdownMenuLabel className="font-normal !text-ash !normal-case !tracking-normal">
          <div className="flex items-center gap-3 py-1">
            <Avatar className="size-10">
              <AvatarImage
                src={avatarUrl || undefined}
                alt={user?.discord_username || "User"}
              />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-1 overflow-hidden">
              <p className="text-body text-on-primary truncate font-medium">
                {user?.discord_username || "User"}
              </p>
              <p className="text-caption text-ash truncate">
                {user?.email || "No email"}
              </p>
              {user?.is_demo && (
                <Badge variant="mono" className="w-fit mt-1">
                  Demo Account
                </Badge>
              )}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => navigate({ to: "/settings" })}
            className="cursor-pointer"
          >
            <Settings className="size-4" />
            <span>Settings</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={onLogout}
          variant="destructive"
          className="cursor-pointer"
        >
          <LogOut className="size-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
