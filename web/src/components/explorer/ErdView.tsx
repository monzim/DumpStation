import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTheme } from '@astryxdesign/core/theme'
import { HStack, StackItem } from '@astryxdesign/core/Layout'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Button } from '@astryxdesign/core/Button'
import { Text } from '@astryxdesign/core/Text'
import { Banner } from '@astryxdesign/core/Banner'
import { Card } from '@astryxdesign/core/Card'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { Minus, Plus, Maximize, Copy, Check } from 'lucide-react'
import type { ServerERD } from './api'

const ZOOM_MIN = 0.1
const ZOOM_MAX = 3

/** Build a Mermaid erDiagram from the /erd payload. Names are sanitized to Mermaid's identifier grammar. */
export function buildMermaid(erd: ServerERD): string {
  const out = ['erDiagram']
  const tables = erd.tables ?? []
  const multiSchema = new Set(tables.map((t) => t.schema)).size > 1
  const id = (schema: string, name: string) => {
    const s = (v: string) => v.replace(/[^A-Za-z0-9_]/g, '_')
    return multiSchema || schema !== 'public' ? `${s(schema)}__${s(name)}` : s(name)
  }
  for (const t of tables) {
    out.push(`  ${id(t.schema, t.name)} {`)
    for (const c of t.columns ?? []) {
      const type = c.data_type.replace(/[^A-Za-z0-9_]/g, '_') || 'value'
      const raw = c.name.replace(/[^A-Za-z0-9_]/g, '_')
      const name = /^[A-Za-z]/.test(raw) ? raw : `_${raw}`
      const keys = c.is_primary_key ? ' PK' : ''
      out.push(`    ${type} ${name}${keys}${c.is_nullable ? '' : ' "not null"'}`)
    }
    out.push('  }')
  }
  for (const r of erd.relations ?? []) {
    // Labels are user data: keep them to identifier characters (Mermaid also sanitizes in strict mode).
    const label = `${r.from_column.replace(/[^A-Za-z0-9_]/g, '_')} to ${r.to_column.replace(/[^A-Za-z0-9_]/g, '_')}`
    out.push(`  ${id(r.to_schema, r.to_table)} ||--o{ ${id(r.from_schema, r.from_table)} : "${label}"`)
  }
  return out.join('\n')
}

/**
 * Renders the ERD with Mermaid (lazy-loaded) inside a scrollable, draggable
 * viewport. Theme follows the app's resolved light/dark mode.
 */
export function ErdView({ erd }: { erd: ServerERD }) {
  const { mode } = useTheme()
  const source = useMemo(() => buildMermaid(erd), [erd])
  const rid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const natural = useRef<{ w: number; h: number } | null>(null)
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const applyZoom = useCallback((z: number) => {
    const svg = canvasRef.current?.querySelector('svg')
    if (!svg || !natural.current) return
    svg.style.width = `${natural.current.w * z}px`
    svg.style.height = `${natural.current.h * z}px`
  }, [])

  const fit = useCallback(() => {
    const vp = viewportRef.current
    if (!vp || !natural.current) return
    const z = Math.min(1, (vp.clientWidth - 32) / natural.current.w, (vp.clientHeight - 32) / natural.current.h)
    setZoom(Math.max(ZOOM_MIN, Number(z.toFixed(2))))
  }, [])

  useEffect(() => {
    let cancelled = false
    setState('loading')
    ;(async () => {
      try {
        const { default: mermaid } = await import('mermaid')
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: mode === 'dark' ? 'dark' : 'neutral',
          fontFamily: 'var(--font-family-body, ui-sans-serif, system-ui, sans-serif)',
          er: { useMaxWidth: false, diagramPadding: 16, entityPadding: 10, minEntityWidth: 90, fontSize: 12 },
        })
        const { svg } = await mermaid.render(`erd-${rid}-${mode}`, source)
        if (cancelled || !canvasRef.current) return
        canvasRef.current.innerHTML = svg
        const el = canvasRef.current.querySelector('svg')
        if (el) {
          const vb = el.viewBox?.baseVal
          const w = vb && vb.width ? vb.width : el.getBoundingClientRect().width
          const h = vb && vb.height ? vb.height : el.getBoundingClientRect().height
          natural.current = { w, h }
          el.removeAttribute('width')
          el.style.maxWidth = 'none'
          el.style.background = 'transparent'
        }
        setState('ready')
        // Fit large diagrams on first render.
        requestAnimationFrame(() => {
          if (!cancelled) fit()
        })
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [source, mode, rid, fit])

  useEffect(() => {
    if (state === 'ready') applyZoom(zoom)
  }, [zoom, state, applyZoom])

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !viewportRef.current) return
    drag.current = { x: e.clientX, y: e.clientY, sl: viewportRef.current.scrollLeft, st: viewportRef.current.scrollTop }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || !viewportRef.current) return
    viewportRef.current.scrollLeft = d.sl - (e.clientX - d.x)
    viewportRef.current.scrollTop = d.st - (e.clientY - d.y)
  }
  const endDrag = () => {
    drag.current = null
  }

  const step = (dir: 1 | -1) => setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number((z * (dir > 0 ? 1.25 : 0.8)).toFixed(2)))))

  return (
    <Card padding={0}>
      <HStack gap={1} vAlign="center" paddingInline={3} paddingBlock={2} wrap="wrap" style={{ borderBottom: 'var(--border-width) solid var(--color-border)' }}>
        <IconButton label="Zoom out" icon={<Minus size={14} />} size="sm" variant="ghost" onClick={() => step(-1)} isDisabled={state !== 'ready'} />
        <Text type="supporting" hasTabularNumbers style={{ minWidth: 44, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </Text>
        <IconButton label="Zoom in" icon={<Plus size={14} />} size="sm" variant="ghost" onClick={() => step(1)} isDisabled={state !== 'ready'} />
        <Button label="Fit" size="sm" variant="ghost" icon={<Maximize size={14} />} onClick={fit} isDisabled={state !== 'ready'} />
        <Button label="Actual size" size="sm" variant="ghost" onClick={() => setZoom(1)} isDisabled={state !== 'ready'} />
        <StackItem size="fill">
          <Text type="supporting" color="secondary">
            Drag to pan
          </Text>
        </StackItem>
        <Button
          label={copied ? 'Copied' : 'Copy Mermaid source'}
          size="sm"
          variant="ghost"
          icon={copied ? <Check size={14} /> : <Copy size={14} />}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(source)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              /* blocked */
            }
          }}
        />
      </HStack>
      {state === 'error' && (
        <Banner status="error" title="Could not render the diagram" description={error} container="section" />
      )}
      <div
        ref={viewportRef}
        className="ds-erd"
        role="img"
        aria-label={`Entity relationship diagram with ${erd.tables?.length ?? 0} tables and ${erd.relations?.length ?? 0} relations`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          overflow: 'auto',
          height: 'calc(100dvh - 300px)',
          minHeight: 360,
          cursor: drag.current ? 'grabbing' : 'grab',
          padding: 'var(--spacing-4)',
          boxSizing: 'border-box',
          touchAction: 'none',
          position: 'relative',
        }}
      >
        {state === 'loading' && <Skeleton height={320} />}
        <div ref={canvasRef} style={{ width: 'max-content', margin: '0 auto' }} />
      </div>
    </Card>
  )
}
