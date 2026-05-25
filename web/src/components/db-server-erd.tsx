import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ServerERDSchema } from "@/lib/types/api";

interface Props {
  schema: ServerERDSchema;
}

/**
 * Renders a PostgreSQL schema as a Mermaid erDiagram.
 *
 * Mermaid is loaded lazily (~200 KB) so the dep only ships when an ERD is
 * actually viewed. We initialize Mermaid with `securityLevel: "strict"` so it
 * escapes the values we hand it; the SVG it returns is then mounted via a
 * ref-driven `innerHTML` assignment (no React `dangerouslySetInnerHTML`).
 *
 * Errors fall back to a `<pre>` of the source so the user can still copy the
 * diagram into mermaid.live.
 */
export function DbServerERD({ schema }: Props) {
  const source = useMemo(() => buildMermaid(schema), [schema]);
  const diagramId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "strict",
          er: { useMaxWidth: false },
        });
        const { svg } = await mermaid.render(`erd-${diagramId}`, source);
        if (cancelled) return;
        if (containerRef.current) {
          // Mermaid sanitized output (securityLevel: "strict"). Mounting via
          // ref avoids React's dangerouslySetInnerHTML escape hatch while
          // producing the same DOM.
          containerRef.current.innerHTML = svg;
        }
        setRendered(true);
        setError(null);
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

  if (schema.tables.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No tables in this database to diagram.
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-destructive">
          Failed to render the ERD: {error}
        </div>
        <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto">
          {source}
        </pre>
      </div>
    );
  }

  // The ref'd <div> below has NO React children — only Mermaid's SVG goes
  // into it via innerHTML. The "Rendering…" placeholder is a sibling so
  // React never tries to reconcile across the manually-injected SVG (which
  // was the cause of the "Node.removeChild: The node to be removed is not
  // a child of this node" error).
  return (
    <div className="relative min-h-32">
      {!rendered && (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Rendering diagram…
        </div>
      )}
      <div
        ref={containerRef}
        className={cn(
          "overflow-auto rounded-xl border bg-card p-6 [&_svg]:max-w-none",
          !rendered && "hidden"
        )}
      />
    </div>
  );
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
