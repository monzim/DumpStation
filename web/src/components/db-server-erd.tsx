import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ServerERDSchema } from "@/lib/types/api";

interface Props {
  schema: ServerERDSchema;
}

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.2;

/**
 * Renders a PostgreSQL schema as a Mermaid erDiagram with pan + zoom.
 *
 * Mermaid is loaded lazily (~200 KB) so the dep only ships when an ERD is
 * actually viewed. Initialized with `securityLevel: "strict"` so user-supplied
 * names are escaped; the returned SVG is written into a ref'd container via
 * `innerHTML`. That container has zero React children, so React's reconciler
 * never collides with the manually-injected DOM.
 *
 * Pan / zoom UX (mirrors what pgAdmin / dbdiagram.io do):
 *   - Cmd/Ctrl + wheel        → zoom toward cursor
 *   - Click + drag            → pan
 *   - +/- buttons             → zoom in/out
 *   - Fit                     → scale to the viewport
 *   - Reset                   → back to 100% and scroll origin
 */
export function DbServerERD({ schema }: Props) {
  const source = useMemo(() => buildMermaid(schema), [schema]);
  const diagramId = useId().replace(/[^a-zA-Z0-9]/g, "");

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);
  const [didAutoFit, setDidAutoFit] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Render Mermaid → SVG, mount via innerHTML.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        // Saniti-themed dark ERD. Mermaid's "dark" base + targeted theme
        // vars map onto canvas-soft / hairline / ash so the diagram reads
        // as part of the Studio surface rather than a stock mermaid block.
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "strict",
          fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
          themeVariables: {
            background: "#212121",
            mainBkg: "#212121",
            primaryColor: "#212121",
            primaryTextColor: "#ffffff",
            primaryBorderColor: "#353535",
            secondaryColor: "#0b0b0b",
            tertiaryColor: "#0b0b0b",
            lineColor: "#797979",
            textColor: "#b9b9b9",
            attributeBackgroundColorOdd: "#212121",
            attributeBackgroundColorEven: "#1a1a1a",
            nodeBorder: "#353535",
            relationLabelColor: "#b9b9b9",
            relationLabelBackground: "#0b0b0b",
          },
          // Tighten entity geometry: default entityPadding (15) plus the
          // minEntityWidth (100) leave huge whitespace inside each table.
          // 8/80/11 pulls columns flush so the diagram doesn't waste space
          // and large schemas read at higher zoom levels.
          er: {
            useMaxWidth: false,
            diagramPadding: 16,
            entityPadding: 8,
            minEntityWidth: 80,
            minEntityHeight: 40,
            fontSize: 11,
          },
        });
        const { svg } = await mermaid.render(`erd-${diagramId}`, source);
        if (cancelled) return;
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
        setRendered(true);
        setError(null);
        setZoom(1);
        setDidAutoFit(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setRendered(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source, diagramId]);

  // Cmd/Ctrl + wheel → zoom toward cursor. Plain wheel keeps native scroll.
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const viewport = viewportRef.current;
    if (!viewport) return;

    setZoom((prev) => {
      const delta = -Math.sign(e.deltaY) * ZOOM_STEP;
      const next = clamp(prev + delta, ZOOM_MIN, ZOOM_MAX);
      if (next === prev) return prev;

      // Keep the point under the cursor stationary on screen.
      const rect = viewport.getBoundingClientRect();
      const cursorX = e.clientX - rect.left + viewport.scrollLeft;
      const cursorY = e.clientY - rect.top + viewport.scrollTop;
      const ratio = next / prev;

      // Defer to next frame so the new transform is laid out before we
      // adjust scroll — otherwise scroll values are calculated against the
      // old size and overshoot.
      requestAnimationFrame(() => {
        viewport.scrollLeft = cursorX * ratio - (e.clientX - rect.left);
        viewport.scrollTop = cursorY * ratio - (e.clientY - rect.top);
      });
      return next;
    });
  }, []);

  // Drag-to-pan. We tracked drag state on refs so React rerenders are minimal.
  const dragStartRef = useRef({ x: 0, y: 0, scrollX: 0, scrollY: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollX: viewport.scrollLeft,
      scrollY: viewport.scrollTop,
    };
    setIsDragging(true);
  }, []);

  // Pan tracking uses window-level listeners while dragging so the user can
  // drag past the viewport edge without losing the gesture.
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      viewport.scrollLeft =
        dragStartRef.current.scrollX - (e.clientX - dragStartRef.current.x);
      viewport.scrollTop =
        dragStartRef.current.scrollY - (e.clientY - dragStartRef.current.y);
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  const zoomIn = () => setZoom((z) => clamp(z + ZOOM_STEP, ZOOM_MIN, ZOOM_MAX));
  const zoomOut = () =>
    setZoom((z) => clamp(z - ZOOM_STEP, ZOOM_MIN, ZOOM_MAX));

  const reset = useCallback(() => {
    setZoom(1);
    if (viewportRef.current) {
      viewportRef.current.scrollTo({ left: 0, top: 0, behavior: "smooth" });
    }
  }, []);

  /*
   * Fit the SVG into the viewport (with padding) and center it. Reads the
   * SVG's intrinsic size (Mermaid emits width/height attrs when
   * useMaxWidth:false) rather than its current client rect, so the result
   * is independent of the live zoom — fit() is idempotent.
   */
  const fit = useCallback(() => {
    const viewport = viewportRef.current;
    const svg = containerRef.current?.querySelector("svg") as
      | SVGSVGElement
      | null;
    if (!viewport || !svg) return;

    let w = parseFloat(svg.getAttribute("width") || "0");
    let h = parseFloat(svg.getAttribute("height") || "0");
    if ((!w || !h) && typeof svg.getBBox === "function") {
      try {
        const bb = svg.getBBox();
        w = bb.width;
        h = bb.height;
      } catch {
        // getBBox can throw before layout settles.
      }
    }
    if (!w || !h) return;

    const padding = 48;
    const scaleX = (viewport.clientWidth - padding) / w;
    const scaleY = (viewport.clientHeight - padding) / h;
    const next = clamp(Math.min(scaleX, scaleY), ZOOM_MIN, ZOOM_MAX);
    setZoom(next);

    // After zoom relayout, scroll to the midpoint so the diagram is
    // centered. The flex wrapper visually centers anything smaller than
    // the viewport; this scroll handles the >viewport case.
    requestAnimationFrame(() => {
      const v = viewportRef.current;
      if (!v) return;
      const cx = Math.max(0, (v.scrollWidth - v.clientWidth) / 2);
      const cy = Math.max(0, (v.scrollHeight - v.clientHeight) / 2);
      v.scrollTo({ left: cx, top: cy });
    });
  }, []);

  // Auto-fit once on first render so large schemas don't open at 100%
  // tucked into a corner with mostly-empty canvas.
  useEffect(() => {
    if (!rendered || didAutoFit) return;
    const t = window.setTimeout(() => {
      fit();
      setDidAutoFit(true);
    }, 80);
    return () => window.clearTimeout(t);
  }, [rendered, didAutoFit, fit]);

  if (schema.tables.length === 0) {
    return (
      <div className="text-body-sm text-mute">
        No tables in this database to diagram.
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="text-body-sm text-error">
          Failed to render the ERD: {error}
        </div>
        <pre className="text-mono-eyebrow bg-canvas-soft text-ash p-4 rounded-app-lg border border-hairline-soft overflow-x-auto">
          {source}
        </pre>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Floating toolbar */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-full border border-hairline-soft bg-canvas-soft/95 backdrop-blur p-1">
        <Button
          variant="ghost-dark"
          size="icon-sm"
          onClick={zoomOut}
          disabled={zoom <= ZOOM_MIN || !rendered}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Minus className="size-4" />
        </Button>
        <button
          type="button"
          onClick={reset}
          disabled={!rendered}
          className="min-w-14 px-2 text-mono-caps text-ash hover:text-on-primary uppercase tabular-nums transition-colors disabled:opacity-50"
          title="Reset to 100%"
          aria-label={`Current zoom ${Math.round(zoom * 100)}%, click to reset`}
        >
          {Math.round(zoom * 100)}%
        </button>
        <Button
          variant="ghost-dark"
          size="icon-sm"
          onClick={zoomIn}
          disabled={zoom >= ZOOM_MAX || !rendered}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <Plus className="size-4" />
        </Button>
        <div className="w-px h-5 bg-hairline-soft mx-0.5" />
        <Button
          variant="ghost-dark"
          size="icon-sm"
          onClick={fit}
          disabled={!rendered}
          aria-label="Fit to viewport"
          title="Fit to viewport"
        >
          <Maximize2 className="size-4" />
        </Button>
        <Button
          variant="ghost-dark"
          size="icon-sm"
          onClick={reset}
          disabled={!rendered}
          aria-label="Reset view"
          title="Reset view"
        >
          <RotateCcw className="size-4" />
        </Button>
      </div>

      {/* Subtle hint, only while idle */}
      {rendered && (
        <div className="absolute bottom-3 left-3 z-10 text-mono-caps text-mute uppercase bg-canvas-soft/90 backdrop-blur px-3 py-1.5 rounded-app-sm border border-hairline-soft pointer-events-none">
          Cmd/Ctrl + scroll to zoom · drag to pan
        </div>
      )}

      {!rendered && (
        <div className="rounded-app-lg border border-hairline-soft bg-canvas-soft p-6 text-body-sm text-ash">
          Rendering diagram…
        </div>
      )}

      {/* Viewport — the ref'd container inside has zero React children so
          React never reconciles across the injected SVG. The flex wrapper
          centers the scaled diagram when it's smaller than the viewport;
          when larger, it falls back to natural overflow + scroll.

          No bordered card — the diagram is the page. The route bleeds this
          div out of the AppLayout container padding so it spans the full
          working area. Height fills the remaining viewport. */}
      <div
        ref={viewportRef}
        className={cn(
          "overflow-auto bg-canvas border-y border-hairline-soft h-[calc(100vh-220px)] min-h-[520px]",
          isDragging ? "cursor-grabbing" : "cursor-grab",
          !rendered && "hidden"
        )}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
      >
        <div className="min-h-full min-w-full flex items-center justify-center p-6">
          <div
            className="origin-center select-none"
            style={{
              // `zoom` is more reliable than `transform: scale` here because
              // it affects layout — scrollbars adjust naturally as we scale.
              // Supported in all evergreen browsers.
              zoom,
            }}
          >
            <div ref={containerRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Build Mermaid erDiagram source from the schema payload.
 *
 * Identifiers are sanitised because Mermaid only allows `[A-Za-z][A-Za-z0-9_]*`
 * inside entity declarations. Original names go into the relation label so
 * the visual stays accurate.
 */
function buildMermaid(schema: ServerERDSchema): string {
  const out: string[] = ["erDiagram"];

  for (const t of schema.tables) {
    const key = mermaidId(t.schema, t.name);
    out.push(`  ${key} {`);
    for (const c of t.columns) {
      const type = mermaidType(c.data_type);
      const name = sanitizeColumnName(c.name);
      const attrs = c.is_primary_key ? " PK" : "";
      const nullable = c.is_nullable ? "" : ' "NOT NULL"';
      out.push(`    ${type} ${name}${attrs}${nullable}`);
    }
    out.push("  }");
  }

  for (const r of schema.relations) {
    const fromKey = mermaidId(r.from_schema, r.from_table);
    const toKey = mermaidId(r.to_schema, r.to_table);
    // crow's-foot many-to-one: parent ||--o{ child : "label".
    out.push(`  ${toKey} ||--o{ ${fromKey} : "${r.constraint_name}"`);
  }

  return out.join("\n");
}

function mermaidId(schema: string, name: string): string {
  const prefix = schema === "public" ? "" : `${sanitize(schema)}_`;
  return `${prefix}${sanitize(name)}`.toUpperCase();
}

function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9_]/g, "_");
}

function sanitizeColumnName(name: string): string {
  // Mermaid column names must match [A-Za-z][\w]* — fall back to underscore
  // prefix when the original name doesn't.
  const safe = name.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z]/.test(safe) ? safe : `_${safe}`;
}

function mermaidType(pgType: string): string {
  // Mermaid is forgiving about type strings — but spaces and parens break
  // the parser. Collapse to alphanumeric + underscore.
  return pgType.replace(/[^A-Za-z0-9]/g, "_") || "value";
}
