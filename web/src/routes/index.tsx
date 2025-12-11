import { useTheme } from "@/components/theme-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bell,
  Calendar,
  CheckCircle2,
  Cloud,
  Database,
  Github,
  HardDrive,
  KeyRound,
  Moon,
  Play,
  RefreshCw,
  Server,
  Shield,
  Smartphone,
  Sun,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "DumpStation - Automated PostgreSQL Backup Service" },
      {
        name: "description",
        content:
          "DumpStation is a powerful self-hosted backup service that automates your PostgreSQL database backups with cloud storage, smart scheduling, and instant notifications.",
      },
      {
        name: "keywords",
        content:
          "PostgreSQL backup, database backup, automated backup, cloud storage, AWS S3, Cloudflare R2, self-hosted, open source, backup service",
      },
      // Open Graph
      {
        property: "og:title",
        content: "DumpStation - Automated PostgreSQL Backup Service",
      },
      {
        property: "og:description",
        content:
          "Never lose your PostgreSQL data again. Automate backups with cloud storage, smart scheduling, and instant notifications.",
      },
      {
        property: "og:url",
        content: "https://dumpstation.monzim.com",
      },
      // Twitter Card
      {
        name: "twitter:title",
        content: "DumpStation - Automated PostgreSQL Backup Service",
      },
      {
        name: "twitter:description",
        content:
          "Never lose your PostgreSQL data again. Automate backups with cloud storage, smart scheduling, and instant notifications.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://dumpstation.monzim.com",
      },
    ],
  }),
});

function LandingPage() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const toggleTheme = () => {
    if (theme === "system") {
      setTheme(resolvedTheme === "dark" ? "light" : "dark");
    } else {
      setTheme(theme === "dark" ? "light" : "dark");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary text-primary-foreground p-2 rounded-xl shadow-lg">
                <Database className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold bg-linear-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                DumpStation
              </span>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              <a
                href="#features"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Features
              </a>
              <a
                href="#integrations"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Integrations
              </a>
              <a
                href="#how-it-works"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                How it Works
              </a>
              <a
                href="#demo"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Try Demo
              </a>
            </nav>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="h-9 w-9"
              >
                {resolvedTheme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
                <span className="sr-only">Toggle theme</span>
              </Button>

              <Button size="sm" asChild>
                <Link to="/login">
                  Get Started
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-primary/10 to-background pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent pointer-events-none" />

        <div className="container mx-auto px-4 py-24 md:py-32 relative">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <Badge variant="secondary" className="px-4 py-1.5">
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              Automated PostgreSQL Backups
            </Badge>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight">
              Never lose your{" "}
              <span className="bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                PostgreSQL
              </span>{" "}
              data again
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              DumpStation is a powerful backup service that automates your
              PostgreSQL database backups with cloud storage, smart scheduling,
              and instant notifications.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Button size="lg" className="w-full sm:w-auto text-base" asChild>
                <Link to="/login">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto text-base"
                asChild
              >
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Github className="mr-2 h-5 w-5" />
                  View on GitHub
                </a>
              </Button>
            </div>

            {/* Trust indicators */}
            <div className="flex flex-wrap items-center justify-center gap-6 pt-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Self-hosted</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Open Source</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Enterprise Ready</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-16 sm:py-20 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-12 md:mb-16">
            <Badge variant="outline" className="mb-4">
              Features
            </Badge>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4">
              Everything you need for reliable backups
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg">
              A complete solution for managing, scheduling, and monitoring your
              PostgreSQL database backups.
            </p>
          </div>

          {/* Bento Grid Layout */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 md:gap-6 max-w-6xl mx-auto">
            {/* Featured Card - Multi-Database Support */}
            <div className="sm:col-span-2 lg:col-span-2 lg:row-span-2">
              <div className="group relative h-full overflow-hidden rounded-2xl sm:rounded-3xl border bg-gradient-to-br from-primary/5 via-background to-background p-6 sm:p-8 hover:shadow-xl transition-all duration-500 hover:border-primary/30">
                <div className="absolute top-0 right-0 w-32 h-32 sm:w-40 sm:h-40 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-all duration-500" />
                <div className="relative z-10 h-full flex flex-col">
                  <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 sm:mb-6 group-hover:scale-110 transition-transform duration-300">
                    <Database className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold mb-2 sm:mb-3">
                    Multi-Database Support
                  </h3>
                  <p className="text-muted-foreground text-sm sm:text-base leading-relaxed flex-grow">
                    Manage backups for multiple PostgreSQL databases from a
                    single dashboard. Configure each with custom settings,
                    retention policies, and schedules.
                  </p>
                  <div className="mt-4 sm:mt-6 flex flex-wrap gap-2">
                    <span className="px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs font-medium rounded-full bg-primary/10 text-primary">
                      Unlimited DBs
                    </span>
                    <span className="px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs font-medium rounded-full bg-primary/10 text-primary">
                      Custom Settings
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cloud Storage */}
            <div className="sm:col-span-1">
              <div className="group relative h-full overflow-hidden rounded-2xl sm:rounded-3xl border bg-card p-5 sm:p-6 hover:shadow-xl transition-all duration-500 hover:border-primary/30">
                <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                  <Cloud className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold mb-1.5 sm:mb-2">
                  Cloud Storage
                </h3>
                <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
                  Store backups securely on AWS S3 or Cloudflare R2.
                </p>
              </div>
            </div>

            {/* Smart Scheduling */}
            <div className="sm:col-span-1">
              <div className="group relative h-full overflow-hidden rounded-2xl sm:rounded-3xl border bg-card p-5 sm:p-6 hover:shadow-xl transition-all duration-500 hover:border-primary/30">
                <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-orange-500/10 flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                  <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-orange-500" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold mb-1.5 sm:mb-2">
                  Smart Scheduling
                </h3>
                <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
                  Automated backup schedules using cron expressions.
                </p>
              </div>
            </div>

            {/* Backup Rotation - Wide Card */}
            <div className="sm:col-span-2">
              <div className="group relative overflow-hidden rounded-2xl sm:rounded-3xl border bg-gradient-to-r from-green-500/5 via-background to-emerald-500/5 p-5 sm:p-6 hover:shadow-xl transition-all duration-500 hover:border-primary/30">
                <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
                  <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
                    <RefreshCw className="h-5 w-5 sm:h-6 sm:w-6 text-green-500" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base sm:text-lg font-semibold mb-1.5 sm:mb-2">
                      Backup Rotation
                    </h3>
                    <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
                      Automatic cleanup with count-based or time-based retention
                      policies. Never run out of storage space.
                    </p>
                  </div>
                  <div className="hidden md:flex items-center gap-2">
                    <div className="flex -space-x-1">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="h-6 w-6 sm:h-8 sm:w-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] sm:text-xs font-medium"
                        >
                          {i}d
                        </div>
                      ))}
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                    <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-destructive/10 flex items-center justify-center">
                      <span className="text-[10px] sm:text-xs text-destructive">
                        ×
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Discord Notifications */}
            <div className="sm:col-span-1">
              <div className="group relative h-full overflow-hidden rounded-2xl sm:rounded-3xl border bg-card p-5 sm:p-6 hover:shadow-xl transition-all duration-500 hover:border-primary/30">
                <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                  <Bell className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-500" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold mb-1.5 sm:mb-2">
                  Discord Notifications
                </h3>
                <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
                  Instant alerts for backup success or failure via Discord
                  webhooks.
                </p>
              </div>
            </div>

            {/* Two-Factor Auth */}
            <div className="sm:col-span-1">
              <div className="group relative h-full overflow-hidden rounded-2xl sm:rounded-3xl border bg-card p-5 sm:p-6 hover:shadow-xl transition-all duration-500 hover:border-primary/30">
                <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-purple-500/10 flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                  <Smartphone className="h-5 w-5 sm:h-6 sm:w-6 text-purple-500" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold mb-1.5 sm:mb-2">
                  Two-Factor Auth
                </h3>
                <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
                  TOTP-based 2FA with Google Authenticator & backup codes.
                </p>
              </div>
            </div>

            {/* Security Card - Wide */}
            <div className="sm:col-span-2">
              <div className="group relative overflow-hidden rounded-2xl sm:rounded-3xl border bg-gradient-to-r from-red-500/5 via-background to-orange-500/5 p-5 sm:p-6 hover:shadow-xl transition-all duration-500 hover:border-primary/30">
                <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
                  <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
                    <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-red-500" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base sm:text-lg font-semibold mb-1.5 sm:mb-2">
                      Secure & Reliable
                    </h3>
                    <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
                      JWT authentication, encrypted connections, and
                      comprehensive activity logging for complete audit trails.
                    </p>
                  </div>
                  <div className="hidden md:flex flex-wrap gap-1.5 sm:gap-2 max-w-[180px]">
                    {["JWT", "SSL/TLS", "Audit Logs"].map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 sm:px-2.5 sm:py-1 text-[10px] sm:text-xs font-medium rounded-full bg-red-500/10 text-red-600 dark:text-red-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations Section */}
      <section id="integrations" className="py-16 sm:py-20 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-12 md:mb-16">
            <Badge variant="outline" className="mb-4">
              Integrations
            </Badge>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4">
              Works with your favorite tools
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg">
              Seamless integration with the services you already use.
            </p>
          </div>

          {/* Integration Cards with connected line design */}
          <div className="max-w-5xl mx-auto">
            {/* Connection line - hidden on mobile */}
            <div className="hidden lg:block relative">
              <div className="absolute top-1/2 left-[10%] right-[10%] h-0.5 bg-gradient-to-r from-transparent via-border to-transparent -translate-y-1/2 z-0" />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 relative z-10">
              {/* PostgreSQL */}
              <div className="group relative">
                <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border-2 bg-card p-4 sm:p-6 md:p-8 hover:shadow-2xl transition-all duration-500 hover:border-blue-500/50 hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative z-10 flex flex-col items-center text-center">
                    <div className="h-14 w-14 sm:h-16 sm:w-16 md:h-20 md:w-20 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                      <Database className="h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 text-blue-500" />
                    </div>
                    <h3 className="font-bold text-base sm:text-lg md:text-xl mb-1">
                      PostgreSQL
                    </h3>
                    <p className="text-muted-foreground text-xs sm:text-sm">
                      All versions supported
                    </p>
                    <div className="mt-3 sm:mt-4 flex flex-wrap justify-center gap-1">
                      {["v12+", "SSL"].map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 sm:px-2 sm:py-0.5 text-[10px] sm:text-xs font-medium rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* AWS S3 */}
              <div className="group relative">
                <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border-2 bg-card p-4 sm:p-6 md:p-8 hover:shadow-2xl transition-all duration-500 hover:border-orange-500/50 hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative z-10 flex flex-col items-center text-center">
                    <div className="h-14 w-14 sm:h-16 sm:w-16 md:h-20 md:w-20 rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                      <Cloud className="h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 text-orange-500" />
                    </div>
                    <h3 className="font-bold text-base sm:text-lg md:text-xl mb-1">
                      AWS S3
                    </h3>
                    <p className="text-muted-foreground text-xs sm:text-sm">
                      Reliable cloud storage
                    </p>
                    <div className="mt-3 sm:mt-4 flex flex-wrap justify-center gap-1">
                      {["Global", "Durable"].map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 sm:px-2 sm:py-0.5 text-[10px] sm:text-xs font-medium rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Cloudflare R2 */}
              <div className="group relative">
                <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border-2 bg-card p-4 sm:p-6 md:p-8 hover:shadow-2xl transition-all duration-500 hover:border-amber-500/50 hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative z-10 flex flex-col items-center text-center">
                    <div className="h-14 w-14 sm:h-16 sm:w-16 md:h-20 md:w-20 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                      <Server className="h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 text-amber-500" />
                    </div>
                    <h3 className="font-bold text-base sm:text-lg md:text-xl mb-1">
                      Cloudflare R2
                    </h3>
                    <p className="text-muted-foreground text-xs sm:text-sm">
                      Zero egress fees
                    </p>
                    <div className="mt-3 sm:mt-4 flex flex-wrap justify-center gap-1">
                      {["S3 API", "Fast"].map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 sm:px-2 sm:py-0.5 text-[10px] sm:text-xs font-medium rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Discord */}
              <div className="group relative">
                <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border-2 bg-card p-4 sm:p-6 md:p-8 hover:shadow-2xl transition-all duration-500 hover:border-indigo-500/50 hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative z-10 flex flex-col items-center text-center">
                    <div className="h-14 w-14 sm:h-16 sm:w-16 md:h-20 md:w-20 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                      <Bell className="h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 text-indigo-500" />
                    </div>
                    <h3 className="font-bold text-base sm:text-lg md:text-xl mb-1">
                      Discord
                    </h3>
                    <p className="text-muted-foreground text-xs sm:text-sm">
                      Webhooks & auth
                    </p>
                    <div className="mt-3 sm:mt-4 flex flex-wrap justify-center gap-1">
                      {["Alerts", "OTP"].map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 sm:px-2 sm:py-0.5 text-[10px] sm:text-xs font-medium rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom tagline */}
            <div className="mt-8 sm:mt-10 md:mt-12 text-center">
              <p className="text-xs sm:text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 sm:gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500" />
                  All integrations included • No extra setup required
                </span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section
        id="how-it-works"
        className="py-16 sm:py-20 md:py-24 bg-muted/30 overflow-hidden"
      >
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-12 md:mb-16">
            <Badge variant="outline" className="mb-4">
              How it Works
            </Badge>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4">
              Get started in minutes
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg">
              Simple setup process to protect your databases.
            </p>
          </div>

          <div className="max-w-5xl mx-auto">
            {/* Steps Container */}
            <div className="relative">
              {/* Connection Line - Desktop */}
              <div className="hidden md:block absolute top-16 left-[16.67%] right-[16.67%] h-0.5">
                <div className="h-full bg-gradient-to-r from-primary/20 via-primary to-primary/20 rounded-full" />
                <div className="absolute top-1/2 left-0 w-full h-1 bg-primary/20 blur-sm -translate-y-1/2" />
              </div>

              {/* Connection Line - Mobile (Vertical) */}
              <div className="md:hidden absolute left-8 sm:left-10 top-20 bottom-20 w-0.5">
                <div className="h-full bg-gradient-to-b from-primary via-primary to-primary/20 rounded-full" />
              </div>

              <div className="grid gap-6 sm:gap-8 md:grid-cols-3 md:gap-6 relative z-10">
                {/* Step 1 */}
                <div className="group relative flex md:flex-col items-start md:items-center gap-4 sm:gap-6 md:gap-0">
                  <div className="relative shrink-0">
                    <div className="h-16 w-16 sm:h-20 sm:w-20 md:h-28 md:w-28 rounded-2xl md:rounded-3xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground flex items-center justify-center text-2xl sm:text-3xl md:text-4xl font-bold shadow-xl group-hover:scale-105 transition-transform duration-300">
                      1
                    </div>
                    <div className="absolute -inset-1 bg-primary/20 rounded-2xl md:rounded-3xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                  <div className="flex-1 md:text-center md:mt-6">
                    <div className="inline-flex items-center gap-2 mb-2">
                      <Database className="h-4 w-4 sm:h-5 sm:w-5 text-primary md:hidden" />
                      <h3 className="font-bold text-lg sm:text-xl">
                        Connect Database
                      </h3>
                    </div>
                    <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                      Add your PostgreSQL database connection details securely
                      with SSL support.
                    </p>
                    <div className="mt-3 sm:mt-4 flex flex-wrap md:justify-center gap-1.5 sm:gap-2">
                      <span className="px-2 py-1 sm:px-2.5 sm:py-1 text-[10px] sm:text-xs font-medium rounded-full bg-primary/10 text-primary">
                        Host & Port
                      </span>
                      <span className="px-2 py-1 sm:px-2.5 sm:py-1 text-[10px] sm:text-xs font-medium rounded-full bg-primary/10 text-primary">
                        SSL/TLS
                      </span>
                    </div>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="group relative flex md:flex-col items-start md:items-center gap-4 sm:gap-6 md:gap-0">
                  <div className="relative shrink-0">
                    <div className="h-16 w-16 sm:h-20 sm:w-20 md:h-28 md:w-28 rounded-2xl md:rounded-3xl bg-gradient-to-br from-orange-500 to-orange-600 text-white flex items-center justify-center text-2xl sm:text-3xl md:text-4xl font-bold shadow-xl group-hover:scale-105 transition-transform duration-300">
                      2
                    </div>
                    <div className="absolute -inset-1 bg-orange-500/20 rounded-2xl md:rounded-3xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                  <div className="flex-1 md:text-center md:mt-6">
                    <div className="inline-flex items-center gap-2 mb-2">
                      <Cloud className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500 md:hidden" />
                      <h3 className="font-bold text-lg sm:text-xl">
                        Configure Storage
                      </h3>
                    </div>
                    <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                      Set up your preferred cloud storage provider for reliable
                      backup storage.
                    </p>
                    <div className="mt-3 sm:mt-4 flex flex-wrap md:justify-center gap-1.5 sm:gap-2">
                      <span className="px-2 py-1 sm:px-2.5 sm:py-1 text-[10px] sm:text-xs font-medium rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400">
                        AWS S3
                      </span>
                      <span className="px-2 py-1 sm:px-2.5 sm:py-1 text-[10px] sm:text-xs font-medium rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400">
                        R2
                      </span>
                    </div>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="group relative flex md:flex-col items-start md:items-center gap-4 sm:gap-6 md:gap-0">
                  <div className="relative shrink-0">
                    <div className="h-16 w-16 sm:h-20 sm:w-20 md:h-28 md:w-28 rounded-2xl md:rounded-3xl bg-gradient-to-br from-green-500 to-green-600 text-white flex items-center justify-center text-2xl sm:text-3xl md:text-4xl font-bold shadow-xl group-hover:scale-105 transition-transform duration-300">
                      3
                    </div>
                    <div className="absolute -inset-1 bg-green-500/20 rounded-2xl md:rounded-3xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                  <div className="flex-1 md:text-center md:mt-6">
                    <div className="inline-flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 md:hidden" />
                      <h3 className="font-bold text-lg sm:text-xl">
                        Schedule Backups
                      </h3>
                    </div>
                    <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                      Define your backup schedule and retention policies with
                      cron expressions.
                    </p>
                    <div className="mt-3 sm:mt-4 flex flex-wrap md:justify-center gap-1.5 sm:gap-2">
                      <span className="px-2 py-1 sm:px-2.5 sm:py-1 text-[10px] sm:text-xs font-medium rounded-full bg-green-500/10 text-green-600 dark:text-green-400">
                        Cron
                      </span>
                      <span className="px-2 py-1 sm:px-2.5 sm:py-1 text-[10px] sm:text-xs font-medium rounded-full bg-green-500/10 text-green-600 dark:text-green-400">
                        Retention
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA under steps */}
            <div className="mt-10 sm:mt-12 md:mt-16 text-center">
              <div className="inline-flex flex-col sm:flex-row items-center gap-3 sm:gap-4 p-4 sm:p-6 rounded-2xl bg-background border shadow-lg">
                <div className="flex items-center gap-2 text-sm sm:text-base">
                  <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
                  <span className="text-muted-foreground">
                    Setup takes less than
                  </span>
                  <span className="font-bold text-foreground">5 minutes</span>
                </div>
                <div className="hidden sm:block h-6 w-px bg-border" />
                <Button size="sm" asChild>
                  <Link to="/login">
                    Start Now
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Dashboard Preview Section */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <Badge variant="outline" className="mb-4">
              Dashboard
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Powerful monitoring at your fingertips
            </h2>
            <p className="text-muted-foreground text-lg">
              Track backup status, storage usage, and system health in
              real-time.
            </p>
          </div>

          <div className="max-w-5xl mx-auto">
            <div className="relative rounded-2xl border bg-linear-to-b from-muted/50 to-muted p-2 shadow-2xl">
              <div className="rounded-xl border bg-background overflow-hidden">
                {/* Mock Dashboard Header */}
                <div className="border-b bg-linear-to-r from-primary/5 via-primary/10 to-primary/5 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary text-primary-foreground p-2 rounded-lg">
                      <Database className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm">DumpStation</div>
                      <div className="text-xs text-muted-foreground">
                        PostgreSQL Backup Service
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mock Stats Grid */}
                <div className="p-6">
                  <div className="grid gap-4 md:grid-cols-3 mb-6">
                    <MockStatCard
                      title="Total Databases"
                      value="12"
                      icon={Database}
                    />
                    <MockStatCard
                      title="Backups (24h)"
                      value="48"
                      icon={HardDrive}
                    />
                    <MockStatCard
                      title="Success Rate"
                      value="99.8%"
                      icon={CheckCircle2}
                    />
                  </div>
                  <div className="grid gap-3">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="flex items-center gap-4 p-3 rounded-lg bg-muted/50"
                      >
                        <div className="h-2 w-2 rounded-full bg-green-500" />
                        <div className="flex-1">
                          <div
                            className="h-3 bg-muted rounded w-1/3 mb-1"
                            style={{ width: `${30 + i * 10}%` }}
                          />
                          <div className="h-2 bg-muted/70 rounded w-1/4" />
                        </div>
                        <div className="h-6 w-16 bg-muted rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <Badge variant="outline" className="mb-4">
              <Play className="h-3.5 w-3.5 mr-1.5" />
              Try It Now
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Explore with our demo account
            </h2>
            <p className="text-muted-foreground text-lg">
              No signup required. Try DumpStation instantly with our read-only
              demo account.
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <Card className="overflow-hidden">
              <div className="grid md:grid-cols-2">
                <div className="p-8 space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Play className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Instant Access</h3>
                        <p className="text-sm text-muted-foreground">
                          One-click login, no registration needed. Explore all
                          features in a sandboxed environment.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Shield className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Read-Only Mode</h3>
                        <p className="text-sm text-muted-foreground">
                          View databases, backups, storage configs, and logs.
                          Write operations are disabled.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <KeyRound className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Bypasses Auth</h3>
                        <p className="text-sm text-muted-foreground">
                          Demo login skips OTP and 2FA for convenience. Regular
                          accounts support full security.
                        </p>
                      </div>
                    </div>
                  </div>

                  <Button size="lg" className="w-full" asChild>
                    <Link to="/login">
                      <Play className="mr-2 h-5 w-5" />
                      Try Demo Account
                    </Link>
                  </Button>
                </div>

                <div className="bg-linear-to-br from-primary/5 via-primary/10 to-primary/5 p-8 border-l">
                  <h4 className="font-semibold mb-6">Security Features</h4>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50">
                      <Smartphone className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">
                          TOTP Two-Factor Auth
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Google Authenticator & Authy compatible
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50">
                      <KeyRound className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">Backup Codes</p>
                        <p className="text-xs text-muted-foreground">
                          12 one-time recovery codes
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50">
                      <Bell className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">Discord OTP Login</p>
                        <p className="text-xs text-muted-foreground">
                          Passwordless via Discord DM
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-linear-to-b from-primary/5 to-primary/10">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center space-y-8">
            <h2 className="text-3xl md:text-5xl font-bold">
              Ready to protect your data?
            </h2>
            <p className="text-lg text-muted-foreground">
              Start backing up your PostgreSQL databases today. Free to
              self-host, no credit card required.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" className="w-full sm:w-auto text-base" asChild>
                <Link to="/login">
                  Get Started Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto text-base"
                asChild
              >
                <a href="#demo">Try Demo First</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12 bg-background">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="bg-primary text-primary-foreground p-2 rounded-xl">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <span className="font-bold">DumpStation</span>
                <p className="text-sm text-muted-foreground">
                  PostgreSQL Backup Service
                </p>
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#features" className="hover:text-foreground transition">
                Features
              </a>
              <a
                href="#integrations"
                className="hover:text-foreground transition"
              >
                Integrations
              </a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition"
              >
                GitHub
              </a>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} monzim.com. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Feature Card Component
function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <Card className="group hover:shadow-lg transition-all duration-300 hover:border-primary/20">
      <CardHeader>
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-xl">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-base">{description}</CardDescription>
      </CardContent>
    </Card>
  );
}

// Integration Card Component
function IntegrationCard({
  icon: Icon,
  name,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center text-center p-6 rounded-2xl border bg-card hover:shadow-lg transition-all duration-300 hover:border-primary/20">
      <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <Icon className="h-8 w-8 text-primary" />
      </div>
      <h3 className="font-semibold text-lg mb-1">{name}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

// Step Card Component
function StepCard({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <div className="relative text-center">
      <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-4 text-2xl font-bold shadow-lg">
        {step}
      </div>
      <h3 className="font-semibold text-xl mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

// Mock Stat Card for Dashboard Preview
function MockStatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <span className="text-sm text-muted-foreground">{title}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
