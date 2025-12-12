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
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4">
          <div className="flex h-14 sm:h-16 items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 sm:gap-3 group">
              <div className="relative">
                <div className="absolute -inset-1 bg-primary/20 rounded-xl blur-sm opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-1.5 sm:p-2 rounded-lg sm:rounded-xl shadow-lg">
                  <Database className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
              </div>
              <span className="text-lg sm:text-xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                DumpStation
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center">
              <div className="flex items-center gap-1 p-1 rounded-full bg-muted/50">
                {[
                  { href: "#features", label: "Features" },
                  { href: "#integrations", label: "Integrations" },
                  { href: "#how-it-works", label: "How it Works" },
                  { href: "#demo", label: "Demo" },
                ].map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-background rounded-full transition-all"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </nav>

            {/* Right Side Actions */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* GitHub Link - Hidden on mobile */}
              <Button
                variant="ghost"
                size="icon"
                className="hidden sm:flex h-9 w-9"
                asChild
              >
                <a
                  href="https://github.com/monzim/DumpStation"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Github className="h-4 w-4" />
                  <span className="sr-only">GitHub</span>
                </a>
              </Button>

              {/* Theme Toggle */}
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

              {/* CTA Button */}
              <Button size="sm" className="hidden sm:flex h-9 px-4" asChild>
                <Link to="/login">
                  Get Started
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>

              {/* Mobile Menu Button */}
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden h-9 w-9"
                asChild
              >
                <a href="#demo">
                  <Play className="h-4 w-4" />
                  <span className="sr-only">Try Demo</span>
                </a>
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="lg:hidden border-t bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between py-2 overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-1">
                {[
                  { href: "#features", label: "Features" },
                  { href: "#integrations", label: "Integrations" },
                  { href: "#how-it-works", label: "How it Works" },
                  { href: "#demo", label: "Demo" },
                ].map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all whitespace-nowrap"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
              <Button
                size="sm"
                className="sm:hidden h-7 px-3 text-xs ml-2"
                asChild
              >
                <Link to="/login">
                  Start
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden min-h-[calc(100vh-4rem)]">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/10 to-background pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent pointer-events-none" />

        {/* Animated Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)] pointer-events-none" />

        {/* Floating Orbs */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/20 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/10 rounded-full blur-[120px] animate-pulse delay-1000" />

        <div className="container mx-auto px-4 py-16 sm:py-20 md:py-24 lg:py-32 relative">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            {/* Left Content */}
            <div className="space-y-6 sm:space-y-8 text-center lg:text-left order-1 lg:order-1">
              <div className="inline-flex items-center">
                <Badge
                  variant="secondary"
                  className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm"
                >
                  <Zap className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1.5 text-yellow-500" />
                  Automated PostgreSQL Backups
                </Badge>
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-[1.1]">
                Never lose your{" "}
                <span className="relative">
                  <span className="bg-gradient-to-r from-primary via-primary to-primary/60 bg-clip-text text-transparent">
                    PostgreSQL
                  </span>
                  <svg
                    className="absolute -bottom-1 sm:-bottom-2 left-0 w-full h-2 sm:h-3 text-primary/30"
                    viewBox="0 0 200 8"
                    preserveAspectRatio="none"
                  >
                    <path
                      d="M0 7 Q50 0 100 7 T200 7"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                    />
                  </svg>
                </span>{" "}
                data again
              </h1>

              <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 leading-relaxed">
                DumpStation is a powerful backup service that automates your
                PostgreSQL database backups with cloud storage, smart
                scheduling, and instant notifications.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 sm:gap-4 pt-2">
                <Button
                  size="lg"
                  className="w-full sm:w-auto text-sm sm:text-base h-11 sm:h-12 px-6 sm:px-8"
                  asChild
                >
                  <Link to="/login">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto text-sm sm:text-base h-11 sm:h-12 px-6 sm:px-8"
                  asChild
                >
                  <a
                    href="https://github.com/monzim/DumpStation"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Github className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                    View on GitHub
                  </a>
                </Button>
              </div>

              {/* Trust indicators */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 sm:gap-6 pt-4 sm:pt-6">
                {[
                  { label: "Self-hosted", icon: Server },
                  { label: "Open Source", icon: Github },
                  { label: "Enterprise Ready", icon: Shield },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground"
                  >
                    <div className="h-5 w-5 sm:h-6 sm:w-6 rounded-full bg-green-500/10 flex items-center justify-center">
                      <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-500" />
                    </div>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Side - Visual Element */}
            <div className="relative order-2 lg:order-2">
              <div className="relative mx-auto max-w-md lg:max-w-none">
                {/* Glow Effect */}
                <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-3xl blur-2xl opacity-60" />

                {/* Main Card */}
                <div className="relative rounded-2xl sm:rounded-3xl border-2 bg-card/80 backdrop-blur-sm p-4 sm:p-6 shadow-2xl">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-4 sm:mb-6 pb-3 sm:pb-4 border-b">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg">
                      <Database className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm sm:text-base">
                        DumpStation
                      </h3>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Backup Dashboard
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-[10px] sm:text-xs text-green-600 dark:text-green-400 font-medium">
                        Active
                      </span>
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-6">
                    {[
                      {
                        label: "Databases",
                        value: "12",
                        color: "text-blue-500",
                      },
                      {
                        label: "Backups",
                        value: "248",
                        color: "text-green-500",
                      },
                      {
                        label: "Success",
                        value: "99.8%",
                        color: "text-primary",
                      },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="text-center p-2 sm:p-3 rounded-xl bg-muted/50"
                      >
                        <div
                          className={`text-lg sm:text-2xl font-bold ${stat.color}`}
                        >
                          {stat.value}
                        </div>
                        <div className="text-[10px] sm:text-xs text-muted-foreground">
                          {stat.label}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Recent Backups */}
                  <div className="space-y-2 sm:space-y-3">
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="font-medium">Recent Backups</span>
                      <span className="text-muted-foreground">Last 24h</span>
                    </div>
                    {[
                      {
                        name: "production_db",
                        time: "2 min ago",
                        size: "2.4 GB",
                        status: "success",
                      },
                      {
                        name: "staging_db",
                        time: "1 hour ago",
                        size: "890 MB",
                        status: "success",
                      },
                      {
                        name: "analytics_db",
                        time: "3 hours ago",
                        size: "5.2 GB",
                        status: "success",
                      },
                    ].map((backup, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-xs sm:text-sm truncate">
                            {backup.name}
                          </div>
                          <div className="text-[10px] sm:text-xs text-muted-foreground">
                            {backup.time}
                          </div>
                        </div>
                        <div className="text-[10px] sm:text-xs font-medium text-muted-foreground shrink-0">
                          {backup.size}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Bottom Action */}
                  <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cloud className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                        <span className="text-[10px] sm:text-xs text-muted-foreground">
                          Connected to AWS S3
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 sm:h-8 text-[10px] sm:text-xs"
                      >
                        View All
                        <ArrowRight className="ml-1 h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Floating Elements */}
                <div className="absolute -top-3 -right-3 sm:-top-4 sm:-right-4 h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-xl rotate-6 hover:rotate-0 transition-transform duration-300">
                  <CheckCircle2 className="h-8 w-8 sm:h-10 sm:w-10 text-white" />
                </div>
                <div className="absolute -bottom-2 -left-2 sm:-bottom-3 sm:-left-3 h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-xl -rotate-6 hover:rotate-0 transition-transform duration-300">
                  <Calendar className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Scroll Indicator */}
          <div className="hidden md:flex justify-center mt-12 lg:mt-16">
            <a
              href="#features"
              className="flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
            >
              <span className="text-xs font-medium">Explore Features</span>
              <div className="h-10 w-6 rounded-full border-2 border-current p-1 group-hover:border-primary transition-colors">
                <div className="h-2 w-1 bg-current rounded-full animate-bounce mx-auto" />
              </div>
            </a>
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
      <section className="py-16 sm:py-20 md:py-24 relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background pointer-events-none" />

        <div className="container mx-auto px-4 relative">
          <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-12 md:mb-16">
            <Badge variant="outline" className="mb-4">
              <HardDrive className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1.5" />
              Dashboard
            </Badge>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4">
              Powerful monitoring at your fingertips
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg">
              Track backup status, storage usage, and system health in
              real-time.
            </p>
          </div>

          <div className="max-w-6xl mx-auto">
            {/* Browser Window Frame */}
            <div className="relative">
              {/* Glow Effect */}
              <div className="absolute -inset-4 bg-gradient-to-r from-primary/10 via-primary/20 to-primary/10 rounded-3xl blur-2xl opacity-50" />

              <div className="relative rounded-xl sm:rounded-2xl border-2 bg-card shadow-2xl overflow-hidden">
                {/* Browser Chrome */}
                <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-4 py-2 sm:py-3 bg-muted/50 border-b">
                  <div className="flex gap-1.5 sm:gap-2">
                    <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-red-500" />
                    <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-yellow-500" />
                    <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-green-500" />
                  </div>
                  <div className="flex-1 flex justify-center">
                    <div className="flex items-center gap-2 px-3 sm:px-4 py-1 sm:py-1.5 rounded-lg bg-background/80 border text-[10px] sm:text-xs text-muted-foreground">
                      <Shield className="h-3 w-3 text-green-500" />
                      <span className="hidden xs:inline">
                        dumpstation.monzim.com/dashboard
                      </span>
                      <span className="xs:hidden">dashboard</span>
                    </div>
                  </div>
                </div>

                {/* Dashboard Content */}
                <div className="grid lg:grid-cols-[240px_1fr] min-h-[400px] sm:min-h-[500px]">
                  {/* Sidebar - Hidden on mobile */}
                  <div className="hidden lg:block border-r bg-muted/30 p-4">
                    <div className="flex items-center gap-3 mb-6 pb-4 border-b">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
                        <Database className="h-5 w-5 text-primary-foreground" />
                      </div>
                      <div>
                        <div className="font-bold text-sm">DumpStation</div>
                        <div className="text-xs text-muted-foreground">
                          Pro Plan
                        </div>
                      </div>
                    </div>
                    <nav className="space-y-1">
                      {[
                        { icon: HardDrive, label: "Dashboard", active: true },
                        { icon: Database, label: "Databases", active: false },
                        { icon: Cloud, label: "Storage", active: false },
                        { icon: Calendar, label: "Schedules", active: false },
                        { icon: Bell, label: "Notifications", active: false },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                            item.active
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          <item.icon className="h-4 w-4" />
                          {item.label}
                        </div>
                      ))}
                    </nav>
                  </div>

                  {/* Main Content */}
                  <div className="p-4 sm:p-6 bg-background">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
                      <div>
                        <h3 className="font-bold text-base sm:text-lg">
                          Dashboard Overview
                        </h3>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          Monitor your backup operations
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-[10px] sm:text-xs font-medium">
                          <div className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-green-500 animate-pulse" />
                          All Systems Operational
                        </span>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
                      {[
                        {
                          label: "Databases",
                          value: "12",
                          change: "+2",
                          icon: Database,
                          color: "text-blue-500",
                        },
                        {
                          label: "Total Backups",
                          value: "1,248",
                          change: "+48",
                          icon: HardDrive,
                          color: "text-green-500",
                        },
                        {
                          label: "Storage Used",
                          value: "48.2 GB",
                          change: "+2.1 GB",
                          icon: Cloud,
                          color: "text-orange-500",
                        },
                        {
                          label: "Success Rate",
                          value: "99.8%",
                          change: "+0.2%",
                          icon: CheckCircle2,
                          color: "text-primary",
                        },
                      ].map((stat) => (
                        <div
                          key={stat.label}
                          className="p-3 sm:p-4 rounded-xl border bg-card hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <stat.icon
                              className={`h-4 w-4 sm:h-5 sm:w-5 ${stat.color}`}
                            />
                            <span className="text-[10px] sm:text-xs text-green-600 dark:text-green-400 font-medium">
                              {stat.change}
                            </span>
                          </div>
                          <div className="text-lg sm:text-2xl font-bold">
                            {stat.value}
                          </div>
                          <div className="text-[10px] sm:text-xs text-muted-foreground">
                            {stat.label}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Recent Activity */}
                    <div className="rounded-xl border bg-card">
                      <div className="flex items-center justify-between p-3 sm:p-4 border-b">
                        <h4 className="font-semibold text-sm">
                          Recent Backups
                        </h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 sm:h-8 text-[10px] sm:text-xs"
                        >
                          View All
                          <ArrowRight className="ml-1 h-3 w-3" />
                        </Button>
                      </div>
                      <div className="divide-y">
                        {[
                          {
                            name: "production_db",
                            status: "success",
                            time: "2 min ago",
                            size: "2.4 GB",
                            duration: "45s",
                          },
                          {
                            name: "staging_db",
                            status: "success",
                            time: "1 hour ago",
                            size: "890 MB",
                            duration: "12s",
                          },
                          {
                            name: "analytics_db",
                            status: "success",
                            time: "3 hours ago",
                            size: "5.2 GB",
                            duration: "1m 23s",
                          },
                          {
                            name: "user_data_db",
                            status: "running",
                            time: "Just now",
                            size: "--",
                            duration: "--",
                          },
                        ].map((backup, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 hover:bg-muted/30 transition-colors"
                          >
                            <div
                              className={`h-2 w-2 rounded-full shrink-0 ${
                                backup.status === "running"
                                  ? "bg-blue-500 animate-pulse"
                                  : "bg-green-500"
                              }`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-xs sm:text-sm truncate">
                                {backup.name}
                              </div>
                              <div className="text-[10px] sm:text-xs text-muted-foreground">
                                {backup.time}
                              </div>
                            </div>
                            <div className="hidden sm:block text-xs text-muted-foreground">
                              {backup.duration}
                            </div>
                            <div className="text-[10px] sm:text-xs font-medium text-muted-foreground">
                              {backup.size}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section
        id="demo"
        className="py-16 sm:py-20 md:py-24 bg-gradient-to-b from-muted/30 via-muted/50 to-muted/30 relative overflow-hidden"
      >
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.2)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.2)_1px,transparent_1px)] bg-[size:3rem_3rem] pointer-events-none" />

        <div className="container mx-auto px-4 relative">
          <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-12 md:mb-16">
            <Badge variant="secondary" className="mb-4 px-3 py-1.5">
              <Play className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1.5" />
              Try It Now
            </Badge>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4">
              Explore with our demo account
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg">
              No signup required. Try DumpStation instantly with our read-only
              demo account.
            </p>
          </div>

          <div className="max-w-5xl mx-auto">
            <div className="grid lg:grid-cols-5 gap-6 sm:gap-8">
              {/* Left Column - Demo Features */}
              <div className="lg:col-span-2 space-y-4 sm:space-y-6">
                {/* Feature Cards */}
                <div className="group relative overflow-hidden rounded-2xl border-2 bg-card p-4 sm:p-6 hover:shadow-xl transition-all duration-300 hover:border-primary/30">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mb-4 shadow-lg group-hover:scale-105 transition-transform">
                      <Play className="h-6 w-6 sm:h-7 sm:w-7 text-primary-foreground" />
                    </div>
                    <h3 className="font-bold text-lg sm:text-xl mb-2">
                      Instant Access
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      One-click login, no registration needed. Explore all
                      features in a sandboxed environment.
                    </p>
                  </div>
                </div>

                <div className="group relative overflow-hidden rounded-2xl border-2 bg-card p-4 sm:p-6 hover:shadow-xl transition-all duration-300 hover:border-green-500/30">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/10 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mb-4 shadow-lg group-hover:scale-105 transition-transform">
                      <Shield className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                    </div>
                    <h3 className="font-bold text-lg sm:text-xl mb-2">
                      Read-Only Mode
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      View databases, backups, storage configs, and logs. Write
                      operations are disabled for safety.
                    </p>
                  </div>
                </div>

                <div className="group relative overflow-hidden rounded-2xl border-2 bg-card p-4 sm:p-6 hover:shadow-xl transition-all duration-300 hover:border-orange-500/30">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/10 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center mb-4 shadow-lg group-hover:scale-105 transition-transform">
                      <Zap className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                    </div>
                    <h3 className="font-bold text-lg sm:text-xl mb-2">
                      Skip Authentication
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Demo login bypasses OTP and 2FA for convenience. Full
                      security on real accounts.
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Column - CTA Card */}
              <div className="lg:col-span-3">
                <div className="relative h-full">
                  {/* Glow */}
                  <div className="absolute -inset-2 bg-gradient-to-r from-primary/20 via-purple-500/20 to-primary/20 rounded-3xl blur-xl opacity-60" />

                  <div className="relative h-full rounded-2xl sm:rounded-3xl border-2 bg-card overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-purple-500/10 p-4 sm:p-6 border-b">
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-2xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-xl">
                          <Database className="h-6 w-6 sm:h-8 sm:w-8 text-primary-foreground" />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg sm:text-xl">
                            Try DumpStation
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Experience the full dashboard
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-4 sm:p-6">
                      {/* Security Features */}
                      <h4 className="font-semibold text-sm sm:text-base mb-4">
                        Security Features Included
                      </h4>
                      <div className="grid sm:grid-cols-2 gap-3 mb-6">
                        {[
                          {
                            icon: Smartphone,
                            label: "TOTP 2FA",
                            desc: "Authenticator apps",
                          },
                          {
                            icon: KeyRound,
                            label: "Backup Codes",
                            desc: "12 recovery codes",
                          },
                          {
                            icon: Bell,
                            label: "Discord OTP",
                            desc: "Passwordless login",
                          },
                          {
                            icon: Shield,
                            label: "Encrypted",
                            desc: "SSL/TLS secured",
                          },
                        ].map((item) => (
                          <div
                            key={item.label}
                            className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                          >
                            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <item.icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-xs sm:text-sm">
                                {item.label}
                              </p>
                              <p className="text-[10px] sm:text-xs text-muted-foreground">
                                {item.desc}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Demo Stats */}
                      <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 py-4 sm:py-6 mb-6 rounded-xl bg-muted/30 border">
                        {[
                          { value: "12", label: "Databases" },
                          { value: "248", label: "Backups" },
                          { value: "3", label: "Storages" },
                        ].map((stat) => (
                          <div key={stat.label} className="text-center">
                            <div className="text-xl sm:text-2xl font-bold text-primary">
                              {stat.value}
                            </div>
                            <div className="text-[10px] sm:text-xs text-muted-foreground">
                              {stat.label}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* CTA Buttons */}
                      <div className="space-y-3">
                        <Button
                          size="lg"
                          className="w-full h-12 sm:h-14 text-base sm:text-lg"
                          asChild
                        >
                          <Link to="/login">
                            <Play className="mr-2 h-5 w-5" />
                            Launch Demo Dashboard
                          </Link>
                        </Button>
                        <p className="text-center text-[10px] sm:text-xs text-muted-foreground">
                          No account needed • Instant access • 100% free
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 sm:py-20 md:py-28 relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-primary/10 to-primary/5" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent opacity-50" />

        {/* Animated Orbs */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/20 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary/15 rounded-full blur-[120px] animate-pulse delay-700" />

        <div className="container mx-auto px-4 relative">
          <div className="max-w-4xl mx-auto">
            {/* Main CTA Card */}
            <div className="relative">
              {/* Glow Effect */}
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/30 via-purple-500/30 to-primary/30 rounded-3xl blur-xl" />

              <div className="relative rounded-2xl sm:rounded-3xl border-2 bg-card/90 backdrop-blur-sm p-6 sm:p-10 md:p-14 text-center overflow-hidden">
                {/* Decorative Elements */}
                <div className="absolute top-0 left-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl" />
                <div className="absolute bottom-0 right-0 w-40 h-40 bg-purple-500/10 rounded-full blur-2xl" />

                <div className="relative z-10 space-y-6 sm:space-y-8">
                  {/* Icon */}
                  <div className="inline-flex items-center justify-center">
                    <div className="relative">
                      <div className="absolute -inset-3 bg-primary/20 rounded-2xl blur-lg animate-pulse" />
                      <div className="relative h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-xl">
                        <Database className="h-8 w-8 sm:h-10 sm:w-10 text-primary-foreground" />
                      </div>
                    </div>
                  </div>

                  {/* Heading */}
                  <div className="space-y-3 sm:space-y-4">
                    <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">
                      Ready to protect your{" "}
                      <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                        data
                      </span>
                      ?
                    </h2>
                    <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
                      Start backing up your PostgreSQL databases today. Free to
                      self-host, no credit card required.
                    </p>
                  </div>

                  {/* Stats Row */}
                  <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 py-4 sm:py-6">
                    {[
                      { value: "100%", label: "Free & Open Source" },
                      { value: "5min", label: "Setup Time" },
                      { value: "24/7", label: "Automated Backups" },
                    ].map((stat) => (
                      <div key={stat.label} className="text-center">
                        <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary">
                          {stat.value}
                        </div>
                        <div className="text-xs sm:text-sm text-muted-foreground">
                          {stat.label}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* CTA Buttons */}
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
                    <Button
                      size="lg"
                      className="w-full sm:w-auto h-12 sm:h-14 px-8 sm:px-10 text-base sm:text-lg shadow-lg hover:shadow-xl transition-shadow"
                      asChild
                    >
                      <Link to="/login">
                        Get Started Free
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full sm:w-auto h-12 sm:h-14 px-8 sm:px-10 text-base sm:text-lg"
                      asChild
                    >
                      <a href="#demo">
                        <Play className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                        Try Demo First
                      </a>
                    </Button>
                  </div>

                  {/* Trust Badges */}
                  <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 pt-4 sm:pt-6">
                    {[
                      { icon: Shield, label: "Secure" },
                      { icon: Github, label: "Open Source" },
                      { icon: Server, label: "Self-Hosted" },
                      { icon: Zap, label: "Fast Setup" },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground"
                      >
                        <item.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/30">
        <div className="container mx-auto px-4">
          {/* Main Footer Content */}
          <div className="py-10 sm:py-12 md:py-16">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 lg:gap-12">
              {/* Brand Column */}
              <div className="col-span-2 md:col-span-4 lg:col-span-2">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg">
                    <Database className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" />
                  </div>
                  <div>
                    <span className="font-bold text-lg sm:text-xl">
                      DumpStation
                    </span>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      PostgreSQL Backup Service
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mb-6">
                  Automated PostgreSQL backups with cloud storage, smart
                  scheduling, and instant notifications. Self-hosted and open
                  source.
                </p>
                {/* Social Links */}
                <div className="flex items-center gap-2">
                  {[
                    {
                      icon: Github,
                      href: "https://github.com/monzim/DumpStation",
                      label: "GitHub",
                    },
                  ].map((social) => (
                    <a
                      key={social.label}
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-muted hover:bg-primary/10 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                    >
                      <social.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                      <span className="sr-only">{social.label}</span>
                    </a>
                  ))}
                </div>
              </div>

              {/* Product Links */}
              <div>
                <h4 className="font-semibold text-sm mb-4">Product</h4>
                <ul className="space-y-2.5 sm:space-y-3">
                  {[
                    { href: "#features", label: "Features" },
                    { href: "#integrations", label: "Integrations" },
                    { href: "#how-it-works", label: "How it Works" },
                    { href: "#demo", label: "Try Demo" },
                  ].map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Resources Links */}
              <div>
                <h4 className="font-semibold text-sm mb-4">Resources</h4>
                <ul className="space-y-2.5 sm:space-y-3">
                  {[
                    {
                      href: "https://github.com/monzim/DumpStation",
                      label: "Documentation",
                      external: true,
                    },
                    {
                      href: "https://github.com/monzim/DumpStation",
                      label: "GitHub",
                      external: true,
                    },
                    {
                      href: "https://github.com/monzim/DumpStation/issues",
                      label: "Support",
                      external: true,
                    },
                    {
                      href: "https://github.com/monzim/DumpStation/releases",
                      label: "Changelog",
                      external: true,
                    },
                  ].map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        target={link.external ? "_blank" : undefined}
                        rel={link.external ? "noopener noreferrer" : undefined}
                        className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                      >
                        {link.label}
                        {link.external && (
                          <ArrowRight className="h-3 w-3 -rotate-45" />
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Legal Links */}
              <div>
                <h4 className="font-semibold text-sm mb-4">Legal</h4>
                <ul className="space-y-2.5 sm:space-y-3">
                  {[
                    { href: "#", label: "Privacy Policy" },
                    { href: "#", label: "Terms of Service" },
                    {
                      href: "https://github.com/monzim/DumpStation/blob/main/LICENSE",
                      label: "License",
                      external: true,
                    },
                  ].map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        target={link.external ? "_blank" : undefined}
                        rel={link.external ? "noopener noreferrer" : undefined}
                        className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t py-6 sm:py-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-2 text-xs sm:text-sm text-muted-foreground">
                <span>© {new Date().getFullYear()} monzim.com</span>
                <span className="hidden sm:inline">•</span>
                <span>All rights reserved</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span>All systems operational</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={() =>
                    window.scrollTo({ top: 0, behavior: "smooth" })
                  }
                >
                  Back to top
                  <ArrowRight className="ml-1 h-3 w-3 -rotate-90" />
                </Button>
              </div>
            </div>
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
