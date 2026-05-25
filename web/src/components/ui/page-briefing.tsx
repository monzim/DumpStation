import * as React from "react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// useNow — ticks every second so live clocks/sync-age labels stay current.
// Cells that don't depend on the clock won't re-render because the value
// stays at the page-hero level.
// ─────────────────────────────────────────────────────────────────────────────
export function useNow(intervalMs = 1000) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ─────────────────────────────────────────────────────────────────────────────
// LiveDot — animated ping. Used in ledger stripes and status badges.
// ─────────────────────────────────────────────────────────────────────────────
export function LiveDot({
  tone = "success",
}: {
  tone?: "success" | "warning" | "danger" | "info";
}) {
  const color =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-amber-400"
        : tone === "danger"
          ? "bg-error"
          : "bg-link-blue-soft";
  return (
    <span className="relative inline-flex h-2 w-2">
      <span
        className={cn(
          "absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping",
          color,
        )}
      />
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", color)} />
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LedgerStripe — the mono "label · value / label · value" run that sits in
// every page briefing. Each item is a tiny key-value pair separated by slashes.
// ─────────────────────────────────────────────────────────────────────────────
export type LedgerItem = { label: string; value: React.ReactNode };

export function LedgerStripe({ items }: { items: LedgerItem[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-mono-caps uppercase text-mute">
      {items.map((item, i) => (
        <span key={i} className="inline-flex items-center gap-2">
          <span className="text-mute/70">{item.label}</span>
          <span className="text-ash">{item.value}</span>
          {i < items.length - 1 && (
            <span className="text-graphite hidden sm:inline">/</span>
          )}
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionRule — numbered hairline divider that segments the editorial rhythm
// ("01 · Topline", "02 · Indicators", etc.).
// ─────────────────────────────────────────────────────────────────────────────
export function SectionRule({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-hairline-soft" />
      {label && (
        <span className="text-mono-micro uppercase text-mute tracking-wider">
          {label}
        </span>
      )}
      <div className="h-px flex-1 bg-hairline-soft" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KpiTile — single bento stat tile with a hover left-rail accent.
// ─────────────────────────────────────────────────────────────────────────────
export type KpiTone =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "brand";

const kpiIconTone: Record<KpiTone, string> = {
  default: "text-ash",
  success: "text-success",
  warning: "text-amber-400",
  danger: "text-error",
  info: "text-link-blue-soft",
  brand: "text-brand",
};

export function KpiTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  isLoading,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ElementType;
  tone?: KpiTone;
  isLoading?: boolean;
}) {
  return (
    <div className="group relative bg-canvas border border-hairline-soft rounded-app-lg p-5 transition-colors hover:border-graphite/80 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <Eyebrow>{label}</Eyebrow>
        <Icon className={cn("size-4", kpiIconTone[tone])} />
      </div>
      <p className="mt-3 text-heading-md tabular-nums text-on-primary">
        {isLoading ? <Skeleton className="h-8 w-20" /> : value}
      </p>
      {hint && (
        <div className="mt-1 text-mono-caps uppercase text-mute">{hint}</div>
      )}
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-0.5 origin-top scale-y-0 bg-on-primary transition-transform duration-300 group-hover:scale-y-100"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PageBriefing — the editorial hero used across every console page.
// Two-line display heading where the second line is the "soft" ash echo,
// the mono date eyebrow, a subtitle, and an optional ledger stripe + CTAs.
// ─────────────────────────────────────────────────────────────────────────────
export function PageBriefing({
  eyebrow,
  title,
  echo,
  subtitle,
  ledger,
  actions,
}: {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  echo?: React.ReactNode;
  subtitle?: React.ReactNode;
  ledger?: LedgerItem[];
  actions?: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">
        <div className="space-y-4 max-w-2xl">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="text-display-lg text-on-primary leading-[0.95]">
            {title}
            {echo && (
              <>
                <br />
                <span className="text-ash">{echo}</span>
              </>
            )}
          </h1>
          {subtitle && <p className="text-subtitle text-ash">{subtitle}</p>}
        </div>

        {(ledger || actions) && (
          <div className="flex flex-col gap-3 items-stretch xl:items-end">
            {ledger && <LedgerStripe items={ledger} />}
            {actions && (
              <div className="flex items-center gap-2 flex-wrap">{actions}</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
