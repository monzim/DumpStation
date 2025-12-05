import { AppLayout } from "@/components/app-layout";
import { useTheme } from "@/components/theme-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { TwoFactorSettings } from "@/components/two-factor-settings";
import {
  fileToBase64,
  getUserInitials,
  useDeleteAvatar,
  useUploadAvatar,
  useUserProfile,
} from "@/lib/api/user";
import { cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import {
  Calendar,
  Camera,
  Loader2,
  Mail,
  Monitor,
  Moon,
  Palette,
  Settings,
  Shield,
  ShieldCheck,
  Sun,
  Trash2,
  User,
  UserCircle,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Settings - DumpStation" },
      {
        name: "description",
        content:
          "Manage your account settings, security preferences, and two-factor authentication.",
      },
      {
        name: "robots",
        content: "noindex, nofollow",
      },
      {
        property: "og:title",
        content: "Settings - DumpStation",
      },
      {
        property: "og:description",
        content: "Manage your account settings and security preferences.",
      },
      {
        property: "og:url",
        content: "https://dumpstation.monzim.com/settings",
      },
      {
        name: "twitter:title",
        content: "Settings - DumpStation",
      },
      {
        name: "twitter:description",
        content: "Manage your account settings and security preferences.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://dumpstation.monzim.com/settings",
      },
    ],
  }),
});

function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { data: user, isLoading: isLoadingUser } = useUserProfile();
  const uploadAvatarMutation = useUploadAvatar();
  const deleteAvatarMutation = useDeleteAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const initials = getUserInitials(user?.discord_username, user?.email);

  const handleAvatarClick = () => {
    if (!user?.is_demo) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast.error(
        "Invalid file type. Please upload a JPEG, PNG, GIF, or WebP image."
      );
      return;
    }

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 2MB.");
      return;
    }

    setIsUploading(true);
    try {
      const base64 = await fileToBase64(file);
      await uploadAvatarMutation.mutateAsync({ image: base64 });
      toast.success("Profile picture updated successfully!");
    } catch (error) {
      console.error("Failed to upload avatar:", error);
      toast.error("Failed to upload profile picture. Please try again.");
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDeleteAvatar = async () => {
    if (!user?.profile_picture_url) return;

    try {
      await deleteAvatarMutation.mutateAsync();
      toast.success("Profile picture removed successfully!");
    } catch (error) {
      console.error("Failed to delete avatar:", error);
      toast.error("Failed to remove profile picture. Please try again.");
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300 space-y-8">
        {/* Page Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Settings
              </h1>
              <p className="text-muted-foreground">
                Manage your account and security preferences
              </p>
            </div>
          </div>
        </div>

        {/* Appearance Section */}
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Appearance</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Theme</CardTitle>
              <CardDescription>
                Choose your preferred color scheme for the interface.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setTheme("light")}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all",
                    theme === "light"
                      ? "border-primary bg-primary/5"
                      : "border-transparent bg-muted/50 hover:bg-muted hover:border-muted-foreground/20"
                  )}
                >
                  <div
                    className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center",
                      theme === "light"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted-foreground/10 text-muted-foreground"
                    )}
                  >
                    <Sun className="h-5 w-5" />
                  </div>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      theme === "light"
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    Light
                  </span>
                </button>

                <button
                  onClick={() => setTheme("dark")}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all",
                    theme === "dark"
                      ? "border-primary bg-primary/5"
                      : "border-transparent bg-muted/50 hover:bg-muted hover:border-muted-foreground/20"
                  )}
                >
                  <div
                    className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center",
                      theme === "dark"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted-foreground/10 text-muted-foreground"
                    )}
                  >
                    <Moon className="h-5 w-5" />
                  </div>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      theme === "dark"
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    Dark
                  </span>
                </button>

                <button
                  onClick={() => setTheme("system")}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all",
                    theme === "system"
                      ? "border-primary bg-primary/5"
                      : "border-transparent bg-muted/50 hover:bg-muted hover:border-muted-foreground/20"
                  )}
                >
                  <div
                    className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center",
                      theme === "system"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted-foreground/10 text-muted-foreground"
                    )}
                  >
                    <Monitor className="h-5 w-5" />
                  </div>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      theme === "system"
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    System
                  </span>
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator />

        {/* Security Section */}
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Security</h2>
          </div>

          <TwoFactorSettings />
        </div>

        <Separator />

        {/* Account Section */}
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <UserCircle className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Account</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Profile Picture</CardTitle>
              <CardDescription>
                {user?.is_demo
                  ? "Profile picture changes are disabled for demo accounts."
                  : "Upload a profile picture to personalize your account. Maximum file size is 2MB."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingUser ? (
                <div className="flex items-center gap-6">
                  <Skeleton className="h-24 w-24 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-9 w-32" />
                    <Skeleton className="h-9 w-24" />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  {/* Avatar Display */}
                  <div className="relative group">
                    <Avatar className="h-24 w-24 ring-2 ring-border ring-offset-2 ring-offset-background">
                      <AvatarImage
                        src={user?.profile_picture_url}
                        alt={user?.discord_username || "Profile"}
                      />
                      <AvatarFallback className="text-2xl font-semibold bg-primary/10 text-primary">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    {!user?.is_demo && (
                      <button
                        onClick={handleAvatarClick}
                        disabled={isUploading}
                        className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-not-allowed"
                      >
                        {isUploading ? (
                          <Loader2 className="h-6 w-6 text-white animate-spin" />
                        ) : (
                          <Camera className="h-6 w-6 text-white" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Hidden File Input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      variant="outline"
                      onClick={handleAvatarClick}
                      disabled={isUploading || user?.is_demo}
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Camera className="mr-2 h-4 w-4" />
                          {user?.profile_picture_url
                            ? "Change Photo"
                            : "Upload Photo"}
                        </>
                      )}
                    </Button>
                    {user?.profile_picture_url && (
                      <Button
                        variant="outline"
                        onClick={handleDeleteAvatar}
                        disabled={
                          deleteAvatarMutation.isPending || user?.is_demo
                        }
                        className="text-destructive hover:text-destructive"
                      >
                        {deleteAvatarMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Removing...
                          </>
                        ) : (
                          <>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>
                Your account details. This information is managed through your
                Discord authentication.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingUser ? (
                <div className="space-y-4">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-10 w-10 rounded-lg" />
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-48" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Username */}
                  <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 border">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-muted-foreground">Username</p>
                      <p className="font-medium truncate">
                        {user?.discord_username || "Not set"}
                      </p>
                    </div>
                  </div>

                  {/* Email */}
                  <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 border">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Mail className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium truncate">
                        {user?.email || "Not set"}
                      </p>
                    </div>
                  </div>

                  {/* 2FA Status */}
                  <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 border">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <ShieldCheck className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-muted-foreground">
                        Two-Factor Authentication
                      </p>
                      <p className="font-medium">
                        {user?.two_factor_enabled ? (
                          <span className="text-green-600 dark:text-green-400">
                            Enabled
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            Not enabled
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Account Created */}
                  <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 border">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Calendar className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-muted-foreground">
                        Account Created
                      </p>
                      <p className="font-medium">
                        {formatDate(user?.created_at)}
                      </p>
                    </div>
                  </div>

                  {/* Demo Account Badge */}
                  {user?.is_demo && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                      <Shield className="h-5 w-5 shrink-0" />
                      <p className="text-sm font-medium">
                        This is a demo account with limited functionality.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
