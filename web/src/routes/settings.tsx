import { AppLayout } from "@/components/app-layout";
import { useTheme } from "@/components/theme-provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TwoFactorSettings } from "@/components/two-factor-settings";
import { cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import {
  Monitor,
  Moon,
  Palette,
  Settings,
  Shield,
  Sun,
  User,
} from "lucide-react";

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
            <User className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Account</h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>
                Your account is authenticated via Discord. To change your
                account details, update your Discord profile.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 border">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Discord Authentication</p>
                  <p className="text-sm text-muted-foreground">
                    Authenticated via Discord OTP
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
