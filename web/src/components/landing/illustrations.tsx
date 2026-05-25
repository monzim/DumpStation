import { cn } from "@/lib/utils";

/*
 * Hero architecture diagram.
 *
 * Visual model: 3 PostgreSQL sources on the left flow through the central
 * DumpStation engine and fan out to 2 target groups on the right — cloud
 * storage and notification channels. Connector lines animate via
 * stroke-dashoffset to suggest data flow; the global prefers-reduced-motion
 * override in styles.css disables that for users who request reduced motion.
 *
 * All geometry uses Saniti CSS-var tokens directly so the diagram tracks
 * any future theme adjustments. The single coral accent sits at the hub's
 * heart — preserving the one-brand-fill-per-viewport rule.
 *
 * Responsive: scales via viewBox + preserveAspectRatio. Section labels and
 * caption row drop out below xs to keep small viewports legible.
 */
export function ArchitectureDiagram({ className }: { className?: string }) {
  return (
    <div className={cn("relative w-full", className)}>
      <svg
        viewBox="0 0 800 440"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-labelledby="arch-title arch-desc"
        className="w-full h-auto block"
        preserveAspectRatio="xMidYMid meet"
      >
        <title id="arch-title">DumpStation backup pipeline</title>
        <desc id="arch-desc">
          Three PostgreSQL databases on the left flow through the central
          DumpStation engine and out to cloud storage targets (S3, R2) and
          notification channels (Discord, Telegram) on the right.
        </desc>

        <defs>
          <pattern
            id="arch-grid"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="1" fill="var(--mute)" opacity="0.16" />
          </pattern>
        </defs>

        <rect width="800" height="440" fill="url(#arch-grid)" />

        {/* Section labels + bracket marks */}
        <g className="arch-section-row">
          <text x="100" y="30" textAnchor="middle">
            SOURCES
          </text>
          <text x="400" y="30" textAnchor="middle">
            ENGINE
          </text>
          <text x="700" y="30" textAnchor="middle">
            TARGETS
          </text>
        </g>
        <g
          fill="none"
          stroke="var(--hairline-soft)"
          strokeWidth="1"
        >
          <path d="M50 46 L50 56 L150 56 L150 46" />
          <path d="M340 46 L340 56 L460 56 L460 46" />
          <path d="M610 46 L610 56 L790 56 L790 46" />
        </g>

        {/* Sources: 3 database cylinders */}
        <DBCylinder x={50} y={130} label="users · 1.2 GB" />
        <DBCylinder x={50} y={220} label="orders · 540 MB" />
        <DBCylinder x={50} y={310} label="analytics · 3.4 GB" />

        {/* Flow lines: sources → hub */}
        <g
          fill="none"
          stroke="var(--hairline-soft)"
          strokeWidth="1.25"
          strokeDasharray="4 6"
          className="arch-flow"
        >
          <path d="M170 150 C 250 150 300 220 348 220" />
          <path d="M170 240 L 348 220" />
          <path d="M170 330 C 250 330 300 220 348 220" />
        </g>

        {/* Central hub */}
        <g transform="translate(400 220)">
          <circle
            r="56"
            fill="var(--canvas-soft)"
            stroke="var(--hairline-soft)"
            strokeWidth="1"
          />
          <circle
            r="38"
            fill="none"
            stroke="var(--on-primary)"
            strokeWidth="1"
            opacity="0.7"
          />
          <circle
            r="22"
            fill="none"
            stroke="var(--ash)"
            strokeWidth="1"
            opacity="0.35"
          />
          {/* Heart dot — single coral accent */}
          <circle r="8" fill="var(--brand)" />
          {/* Pulsing ring around the heart */}
          <circle
            r="8"
            fill="none"
            stroke="var(--brand)"
            strokeWidth="1"
            className="arch-pulse-ring"
          />
          <text y="86" textAnchor="middle" className="arch-hub-label">
            DUMPSTATION
          </text>
          <text y="102" textAnchor="middle" className="arch-hub-sub">
            scheduler · encrypt · stream
          </text>
        </g>

        {/* Flow lines: hub → targets */}
        <g
          fill="none"
          stroke="var(--hairline-soft)"
          strokeWidth="1.25"
          strokeDasharray="4 6"
          className="arch-flow arch-flow-reverse"
        >
          <path d="M456 220 C 540 220 580 150 660 150" />
          <path d="M456 220 C 540 220 580 290 660 290" />
        </g>

        {/* Target 1: cloud storage */}
        <g transform="translate(620 130)">
          <rect
            x="0"
            y="0"
            width="150"
            height="60"
            rx="4"
            fill="var(--canvas-soft)"
            stroke="var(--hairline-soft)"
            strokeWidth="1"
          />
          <g transform="translate(16 18)">
            {/* Cloud glyph */}
            <path
              d="M6,16 C2,16 0,13 0,10 C0,7 2.5,4.5 5.5,4.5 C6,2 8,0 11,0 C14.5,0 17,2.5 17,6 C20,6 22,8 22,11 C22,13.5 20,16 17,16 Z"
              fill="none"
              stroke="var(--on-primary)"
              strokeWidth="1.25"
              strokeLinejoin="round"
              transform="translate(0 4)"
            />
          </g>
          <text x="50" y="28" className="arch-target-name">
            STORAGE
          </text>
          <text x="50" y="44" className="arch-target-sub">
            s3 · r2 · local
          </text>
        </g>

        {/* Target 2: notifications */}
        <g transform="translate(620 280)">
          <rect
            x="0"
            y="0"
            width="150"
            height="60"
            rx="4"
            fill="var(--canvas-soft)"
            stroke="var(--hairline-soft)"
            strokeWidth="1"
          />
          <g transform="translate(16 18)">
            {/* Bell glyph */}
            <path
              d="M11,0 C7.5,0 5,2.5 5,6 L5,12 L3,16 L19,16 L17,12 L17,6 C17,2.5 14.5,0 11,0 Z M9,18 C9,19 10,20 11,20 C12,20 13,19 13,18 Z"
              fill="none"
              stroke="var(--on-primary)"
              strokeWidth="1.25"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
          {/* Ripple arcs */}
          <g
            fill="none"
            stroke="var(--ash)"
            strokeWidth="1"
            opacity="0.5"
          >
            <path d="M42 22 a 6 6 0 0 1 0 16" />
            <path d="M42 16 a 12 12 0 0 1 0 28" />
          </g>
          <text x="74" y="28" className="arch-target-name">
            ALERTS
          </text>
          <text x="74" y="44" className="arch-target-sub">
            discord · telegram
          </text>
        </g>

        {/* Bottom caption row */}
        <g className="arch-caption">
          <text x="100" y="410" textAnchor="middle">
            pg_dump · streaming
          </text>
          <text x="400" y="410" textAnchor="middle">
            cron · retention · OTP
          </text>
          <text x="700" y="410" textAnchor="middle">
            fan-out · audit log
          </text>
        </g>

        <style>{`
          .arch-section-row text,
          .arch-caption text {
            font-family: var(--font-mono);
            font-size: 11px;
            font-weight: 400;
            letter-spacing: 0.08em;
            fill: var(--ash);
          }
          .arch-hub-label {
            font-family: var(--font-mono);
            font-size: 12px;
            font-weight: 500;
            letter-spacing: 0.1em;
            fill: var(--on-primary);
          }
          .arch-hub-sub {
            font-family: var(--font-mono);
            font-size: 9px;
            font-weight: 400;
            letter-spacing: 0.08em;
            fill: var(--ash);
          }
          .arch-target-name {
            font-family: var(--font-mono);
            font-size: 11px;
            font-weight: 500;
            letter-spacing: 0.1em;
            fill: var(--on-primary);
          }
          .arch-target-sub {
            font-family: var(--font-mono);
            font-size: 9px;
            font-weight: 400;
            letter-spacing: 0.06em;
            fill: var(--ash);
          }
          .arch-cyl-label {
            font-family: var(--font-mono);
            font-size: 10px;
            letter-spacing: 0.06em;
            fill: var(--ash);
          }
          .arch-flow {
            animation: arch-flow-dash 3s linear infinite;
          }
          .arch-flow-reverse {
            animation-direction: reverse;
            animation-duration: 4s;
          }
          @keyframes arch-flow-dash {
            from { stroke-dashoffset: 0; }
            to   { stroke-dashoffset: -100; }
          }
          .arch-pulse-ring {
            transform-origin: center;
            transform-box: fill-box;
            animation: arch-pulse 2.4s ease-out infinite;
          }
          @keyframes arch-pulse {
            0%   { transform: scale(1);   opacity: 1; }
            100% { transform: scale(4.5); opacity: 0; }
          }
        `}</style>
      </svg>
    </div>
  );
}

/*
 * A small PostgreSQL-style database cylinder. Used as the source shape in the
 * architecture diagram. Width 120, height 50.
 */
function DBCylinder({
  x,
  y,
  label,
}: {
  x: number;
  y: number;
  label: string;
}) {
  const w = 120;
  const h = 36;
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* Cylinder body */}
      <path
        d={`M0,${-h / 2 + 6}
            L0,${h / 2 - 6}
            C0,${h / 2 + 2} ${w / 2 - 4},${h / 2 + 8} ${w / 2},${h / 2 + 8}
            C${w / 2 + 4},${h / 2 + 8} ${w},${h / 2 + 2} ${w},${h / 2 - 6}
            L${w},${-h / 2 + 6}`}
        fill="var(--canvas-soft)"
        stroke="var(--hairline-soft)"
        strokeWidth="1"
      />
      {/* Top ellipse */}
      <ellipse
        cx={w / 2}
        cy={-h / 2 + 6}
        rx={w / 2}
        ry="6"
        fill="var(--canvas)"
        stroke="var(--hairline-soft)"
        strokeWidth="1"
      />
      {/* Inner band suggesting WAL layers */}
      <ellipse
        cx={w / 2}
        cy={-h / 2 + 14}
        rx={w / 2}
        ry="5"
        fill="none"
        stroke="var(--hairline-soft)"
        strokeWidth="0.75"
        opacity="0.5"
      />
      {/* Cylinder label */}
      <text x={w / 2} y={h / 2 + 26} textAnchor="middle" className="arch-cyl-label">
        {label}
      </text>
    </g>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Step glyphs for the "How it works" cards.
 *
 * Each is a 64×64 monochrome SVG that adopts `currentColor` so it can be
 * tinted per-context via Tailwind text-* classes. Strokes are 1.5px. Minimal
 * geometry — just enough to read at a glance.
 * ────────────────────────────────────────────────────────────────────────── */

interface StepGlyphProps {
  className?: string;
}

export function ConnectGlyph({ className }: StepGlyphProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Connect your Postgres"
      className={cn("w-12 h-12 text-ink", className)}
    >
      {/* Database cylinder on the right */}
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      >
        <ellipse cx="44" cy="20" rx="14" ry="5" />
        <path d="M30,20 L30,42 C30,45 36,47 44,47 C52,47 58,45 58,42 L58,20" />
        <ellipse
          cx="44"
          cy="28"
          rx="14"
          ry="5"
          opacity="0.4"
        />
        {/* Cable from left into DB */}
        <path d="M4,34 L18,34" strokeLinecap="round" />
        <rect x="18" y="30" width="10" height="8" rx="1" />
        <line x1="22" y1="26" x2="22" y2="30" />
        <line x1="24" y1="26" x2="24" y2="30" />
      </g>
    </svg>
  );
}

export function ScheduleGlyph({ className }: StepGlyphProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Pick a schedule and a target"
      className={cn("w-12 h-12 text-ink", className)}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      >
        {/* Clock face */}
        <circle cx="32" cy="32" r="22" />
        {/* Hour ticks at 12, 3, 6, 9 */}
        <line x1="32" y1="12" x2="32" y2="16" />
        <line x1="52" y1="32" x2="48" y2="32" />
        <line x1="32" y1="52" x2="32" y2="48" />
        <line x1="12" y1="32" x2="16" y2="32" />
        {/* Hour + minute hands */}
        <line x1="32" y1="32" x2="32" y2="20" />
        <line x1="32" y1="32" x2="42" y2="32" />
        {/* Center pin */}
        <circle cx="32" cy="32" r="1.5" fill="currentColor" />
      </g>
    </svg>
  );
}

export function NotifyGlyph({ className }: StepGlyphProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Sit back and get notified"
      className={cn("w-12 h-12 text-ink", className)}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      >
        {/* Bell */}
        <path d="M22,40 L42,40 L38,32 L38,24 C38,18 35,14 32,14 C29,14 26,18 26,24 L26,32 Z" />
        <path d="M28,44 C28,46 30,48 32,48 C34,48 36,46 36,44" />
        {/* Sound ripples on the right */}
        <path d="M48,22 a 10 10 0 0 1 0 20" opacity="0.6" />
        <path d="M52,16 a 18 18 0 0 1 0 32" opacity="0.3" />
      </g>
    </svg>
  );
}
