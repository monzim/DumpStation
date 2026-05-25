import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { PolaritySection } from "@/components/ui/polarity-section";
import { StudioWindow } from "@/components/ui/studio-window";
import { Wordmark } from "@/components/ui/wordmark";
import {
  ArchitectureDiagram,
  ConnectGlyph,
  NotifyGlyph,
  ScheduleGlyph,
} from "@/components/landing/illustrations";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bell,
  Calendar,
  Cloud,
  Database,
  Github,
  HardDrive,
  KeyRound,
  Lock,
  Play,
  Server,
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
          "PostgreSQL backup, database backup, automated backup, cloud storage, AWS S3, Cloudflare R2, self-hosted, open source",
      },
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

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#integrations", label: "Integrations" },
  { href: "#demo", label: "Demo" },
];

const STEPS = [
  {
    n: "01",
    title: "Connect your Postgres.",
    body: "Point DumpStation at any reachable PostgreSQL host. Read-only credentials are enough.",
    Glyph: ConnectGlyph,
  },
  {
    n: "02",
    title: "Pick a schedule and a target.",
    body: "Cron-style frequency. S3, R2, or local disk. Per-database overrides when you need them.",
    Glyph: ScheduleGlyph,
  },
  {
    n: "03",
    title: "Sit back. Get notified.",
    body: "Backups run, encrypted artifacts land in storage, Discord and Telegram tell you when something is wrong.",
    Glyph: NotifyGlyph,
  },
];

const FEATURES = [
  {
    icon: Calendar,
    title: "Cron-grade scheduling",
    body: "Per-database cron expressions with a visual builder. Pause, resume, or run-now from anywhere.",
  },
  {
    icon: Cloud,
    title: "S3 and Cloudflare R2",
    body: "Bring your own bucket. We never see your storage credentials in plaintext after setup.",
  },
  {
    icon: Lock,
    title: "OTP download links",
    body: "Time-boxed download URLs gated by a Discord-delivered one-time password. No public artifacts.",
    accent: true,
  },
  {
    icon: Bell,
    title: "Real-time alerts",
    body: "Discord webhooks and Telegram bots fire on failure, success, or quota thresholds.",
  },
  {
    icon: Server,
    title: "Self-hosted, MIT-licensed",
    body: "One Go binary, one PostgreSQL instance, one Cloudflare Worker. Run it on your own infrastructure.",
  },
  {
    icon: KeyRound,
    title: "Audit log and sessions",
    body: "Every backup, download, and admin action is recorded. Sliding sessions with revocable tokens.",
  },
];

const INTEGRATIONS = [
  { name: "PostgreSQL", subtitle: "Source databases" },
  { name: "AWS S3", subtitle: "Primary storage" },
  { name: "Cloudflare R2", subtitle: "Cheap egress" },
  { name: "Discord", subtitle: "OTP & alerts" },
  { name: "Telegram", subtitle: "Mobile alerts" },
  { name: "GitHub OAuth", subtitle: "Sign-in" },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas text-on-primary">
      {/* Sticky nav — bg-canvas without a hairline keeps the editorial pour */}
      <header className="sticky top-0 z-50 bg-canvas/95 backdrop-blur">
        <div className="container mx-auto max-w-[1640px] px-6 lg:px-12 h-16 flex items-center justify-between gap-4">
          <Wordmark size="md" to="/" />

          <nav className="hidden lg:flex items-center gap-2">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="px-3 py-2 text-button-sm text-ash hover:text-on-primary transition-colors"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost-dark" size="icon" asChild>
              <a
                href="https://github.com/monzim/DumpStation"
                target="_blank"
                rel="noreferrer noopener"
                aria-label="GitHub"
              >
                <Github className="size-4" />
              </a>
            </Button>
            <Button variant="ghost-dark" asChild className="hidden sm:inline-flex">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button variant="primary" size="lg" asChild>
              <Link to="/login">
                Get started
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero — text + CTAs constrained to a readable column on the left,
          editorial spec sheet on the right at xl+, diagram fills the full
          PolaritySection container below. */}
      <PolaritySection polarity="dark" padding="loose" as="header">
        <div className="flex flex-col gap-14 lg:gap-20">
          <div className="grid xl:grid-cols-[1fr_auto] gap-12 xl:gap-16">
            <div className="flex flex-col gap-10 lg:gap-14 max-w-4xl">
              <Eyebrow>Self-hosted · Postgres backups</Eyebrow>
              <h1 className="text-display-mega text-on-primary">
                Never lose your
                <br />
                data again.
              </h1>
              <p className="text-subtitle text-ash max-w-2xl">
                DumpStation runs your PostgreSQL backups on a schedule, encrypts
                the artifacts, pushes them to S3 or R2, and pages you on
                Discord or Telegram if anything breaks.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="brand" size="lg" asChild>
                  <Link to="/login">
                    Get started free
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button variant="ghost-dark" size="lg" asChild>
                  <a href="#demo">
                    <Play className="size-4" />
                    Try the demo
                  </a>
                </Button>
              </div>
            </div>

            <HeroSpecPanel />
          </div>

          <StudioWindow
            chrome
            caption="dumpstation › pipeline.svg"
            bodyClassName="p-6 sm:p-10 lg:p-14"
          >
            <ArchitectureDiagram />
          </StudioWindow>
        </div>
      </PolaritySection>

      {/* How it works */}
      <PolaritySection polarity="light" id="how-it-works">
        <div className="grid lg:grid-cols-[1fr_2fr] gap-12">
          <div className="space-y-4">
            <Eyebrow tone="mute">Workflow</Eyebrow>
            <h2 className="text-display-md text-ink">
              Three steps from install
              <br />
              to your first backup.
            </h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {STEPS.map((s) => {
              const { Glyph } = s;
              return (
                <Card key={s.n} variant="feature-light">
                  <div className="flex flex-col gap-6">
                    <div className="size-14 rounded-app-md bg-canvas-paper border border-hairline flex items-center justify-center shrink-0">
                      <Glyph className="text-ink size-7" />
                    </div>
                    <div className="space-y-3">
                      <Eyebrow tone="mute">{`${s.n} · Step`}</Eyebrow>
                      <CardTitle className="text-ink">{s.title}</CardTitle>
                    </div>
                    <p className="text-body-sm text-ink-soft">{s.body}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </PolaritySection>

      {/* Features */}
      <PolaritySection polarity="dark" id="features">
        <div className="space-y-12">
          <div className="space-y-4 max-w-2xl">
            <Eyebrow>Features</Eyebrow>
            <h2 className="text-display-md text-on-primary">
              Features that don't get
              <br />
              in your way.
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <Card
                key={f.title}
                variant={f.accent ? "feature-brand" : "feature-dark"}
              >
                <f.icon
                  className={
                    f.accent ? "size-6 text-ink" : "size-6 text-on-primary"
                  }
                />
                <CardHeader>
                  <CardTitle
                    className={f.accent ? "text-ink" : "text-on-primary"}
                  >
                    {f.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p
                    className={
                      f.accent ? "text-body-sm text-ink/80" : "text-body-sm text-ash"
                    }
                  >
                    {f.body}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </PolaritySection>

      {/* Integrations */}
      <PolaritySection polarity="paper" id="integrations">
        <div className="space-y-12">
          <div className="grid lg:grid-cols-[1fr_2fr] gap-12 items-end">
            <div className="space-y-4">
              <Eyebrow tone="mute">Integrations</Eyebrow>
              <h2 className="text-display-sm text-ink">
                Plays well with what
                <br />
                you already use.
              </h2>
            </div>
            <p className="text-body text-mute max-w-xl">
              Drop DumpStation in beside your existing Postgres, your existing
              bucket, and your existing alert channel. No new accounts to
              create, no new agents to install.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {INTEGRATIONS.map((i) => (
              <div
                key={i.name}
                className="bg-canvas-light border border-hairline rounded-marketing p-6 flex flex-col gap-2"
              >
                <p className="text-heading-sm text-ink">{i.name}</p>
                <p className="text-caption text-slate-soft">{i.subtitle}</p>
              </div>
            ))}
          </div>
        </div>
      </PolaritySection>

      {/* Demo CTA */}
      <PolaritySection polarity="dark" id="demo">
        <div className="flex flex-col items-center text-center gap-6 max-w-3xl mx-auto">
          <Eyebrow>Demo · No signup</Eyebrow>
          <h2 className="text-display-md text-on-primary">
            See it work in sixty seconds.
          </h2>
          <p className="text-subtitle text-ash max-w-xl">
            Click into a read-only demo workspace with sample databases,
            backups, and notification channels. Bring no credentials.
          </p>
          <div className="flex flex-wrap items-center gap-3 justify-center">
            <Button variant="primary" size="lg" asChild>
              <Link to="/login">
                Try the demo dashboard
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="ghost-dark" size="lg" asChild>
              <a
                href="https://github.com/monzim/DumpStation"
                target="_blank"
                rel="noreferrer noopener"
              >
                <Github className="size-4" />
                Read the source
              </a>
            </Button>
          </div>
        </div>
      </PolaritySection>

      {/* Footer */}
      <footer className="bg-canvas border-t border-hairline-soft">
        <div className="container mx-auto max-w-[1640px] px-6 lg:px-12 py-16">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-12">
            <div className="col-span-2 space-y-4 max-w-sm">
              <Wordmark size="lg" />
              <p className="text-caption text-ash">
                DumpStation is an open-source PostgreSQL backup service. Self-host
                it on a single Go binary or a Cloudflare Worker.
              </p>
            </div>
            <FooterColumn
              heading="Product"
              links={[
                { label: "Features", href: "#features" },
                { label: "Integrations", href: "#integrations" },
                { label: "How it works", href: "#how-it-works" },
                { label: "Demo", href: "#demo" },
              ]}
            />
            <FooterColumn
              heading="Resources"
              links={[
                {
                  label: "GitHub",
                  href: "https://github.com/monzim/DumpStation",
                  external: true,
                },
                {
                  label: "Documentation",
                  href: "https://github.com/monzim/DumpStation#readme",
                  external: true,
                },
                {
                  label: "Roadmap",
                  href: "https://github.com/monzim/DumpStation/blob/main/ROADMAP.md",
                  external: true,
                },
              ]}
            />
            <FooterColumn
              heading="Account"
              links={[
                { label: "Sign in", to: "/login" },
                { label: "Try demo", to: "/login" },
              ]}
            />
          </div>
          <div className="mt-16 pt-8 border-t border-hairline-soft flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <p className="text-mono-caps text-mute uppercase">
              © {new Date().getFullYear()} monzim.com · MIT licensed
            </p>
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-2 text-mono-caps text-mute uppercase">
                <Database className="size-3.5" />
                PostgreSQL backup service
              </span>
              <span className="inline-flex items-center gap-2 text-mono-caps text-mute uppercase">
                <HardDrive className="size-3.5" />v 1.0
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/*
 * Editorial spec sheet that fills the hero's right column on xl+ viewports.
 * Hidden below xl since at lg the headline column already wants the room.
 * Uses semantic <dl>/<dt>/<dd> markup so screen readers announce the
 * label/value pairs correctly.
 */
function HeroSpecPanel() {
  return (
    <aside className="hidden xl:flex xl:flex-col xl:justify-end border-l border-hairline-soft pl-10 xl:pl-12 min-w-[240px]">
      <div className="flex flex-col gap-6">
        <Eyebrow>Specification</Eyebrow>
        <dl className="flex flex-col gap-5">
          <SpecRow label="License" value="MIT · open source" />
          <SpecRow label="Runtime" value="Go binary · CF Worker" />
          <SpecRow label="Source" value="PostgreSQL 12+" />
          <SpecRow label="Targets" value="S3 · R2 · Local" />
          <SpecRow label="Alerts" value="Discord · Telegram" />
          <SpecRow
            label="Status"
            value={
              <span className="inline-flex items-center gap-2">
                <span className="size-2 rounded-full bg-success" />
                Stable
              </span>
            }
          />
        </dl>
      </div>
    </aside>
  );
}

function SpecRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-mono-caps text-mute uppercase">{label}</dt>
      <dd className="text-body-sm text-on-primary">{value}</dd>
    </div>
  );
}

interface FooterLink {
  label: string;
  href?: string;
  to?: string;
  external?: boolean;
}

function FooterColumn({
  heading,
  links,
}: {
  heading: string;
  links: FooterLink[];
}) {
  return (
    <div className="space-y-4">
      <p className="text-mono-caps text-mute uppercase">{heading}</p>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.label}>
            {link.to ? (
              <Link
                to={link.to}
                className="text-caption text-ash hover:text-on-primary transition-colors"
              >
                {link.label}
              </Link>
            ) : (
              <a
                href={link.href}
                target={link.external ? "_blank" : undefined}
                rel={link.external ? "noreferrer noopener" : undefined}
                className="text-caption text-ash hover:text-on-primary transition-colors"
              >
                {link.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
