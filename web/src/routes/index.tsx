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
  RefreshCw,
  Server,
  Shield,
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
            </nav>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/login">Sign In</Link>
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
      <section id="features" className="py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge variant="outline" className="mb-4">
              Features
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything you need for reliable backups
            </h2>
            <p className="text-muted-foreground text-lg">
              A complete solution for managing, scheduling, and monitoring your
              PostgreSQL database backups.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={Database}
              title="Multi-Database Support"
              description="Manage backups for multiple PostgreSQL databases from a single dashboard. Configure each with custom settings."
            />
            <FeatureCard
              icon={Cloud}
              title="Cloud Storage"
              description="Store backups securely on AWS S3 or Cloudflare R2. Built-in support for multiple storage backends."
            />
            <FeatureCard
              icon={Calendar}
              title="Smart Scheduling"
              description="Set up automated backup schedules using cron expressions. Daily, weekly, or custom intervals."
            />
            <FeatureCard
              icon={RefreshCw}
              title="Backup Rotation"
              description="Automatic cleanup with count-based or time-based retention policies. Never run out of storage."
            />
            <FeatureCard
              icon={Bell}
              title="Discord Notifications"
              description="Get instant alerts for backup success or failure. OTP authentication via Discord for extra security."
            />
            <FeatureCard
              icon={Shield}
              title="Secure & Reliable"
              description="JWT authentication, encrypted connections, and comprehensive activity logging for audit trails."
            />
          </div>
        </div>
      </section>

      {/* Integrations Section */}
      <section id="integrations" className="py-24">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge variant="outline" className="mb-4">
              Integrations
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Works with your favorite tools
            </h2>
            <p className="text-muted-foreground text-lg">
              Seamless integration with the services you already use.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <IntegrationCard
              icon={Database}
              name="PostgreSQL"
              description="All versions supported"
            />
            <IntegrationCard
              icon={Cloud}
              name="AWS S3"
              description="Reliable cloud storage"
            />
            <IntegrationCard
              icon={Server}
              name="Cloudflare R2"
              description="Zero egress fees"
            />
            <IntegrationCard
              icon={Bell}
              name="Discord"
              description="Webhooks & auth"
            />
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" className="py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge variant="outline" className="mb-4">
              How it Works
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Get started in minutes
            </h2>
            <p className="text-muted-foreground text-lg">
              Simple setup process to protect your databases.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3 max-w-4xl mx-auto">
            <StepCard
              step={1}
              title="Connect Database"
              description="Add your PostgreSQL database connection details securely."
            />
            <StepCard
              step={2}
              title="Configure Storage"
              description="Set up your preferred cloud storage provider for backups."
            />
            <StepCard
              step={3}
              title="Schedule Backups"
              description="Define your backup schedule and retention policies."
            />
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
                <a href="#features">Learn More</a>
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
              © {new Date().getFullYear()} DumpStation. All rights reserved.
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
