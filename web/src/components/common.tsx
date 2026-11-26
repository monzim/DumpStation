// Small shared building blocks used across pages.
import { useState, type ReactNode } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Heading, Text } from '@astryxdesign/core/Text'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Banner } from '@astryxdesign/core/Banner'
import { useToast } from '@astryxdesign/core/Toast'
import { Check, Copy } from 'lucide-react'
import { dateTime, relativeTime } from '@/lib/format'
import { errorMessage } from '@/lib/api/client'

/** A titled panel. Use for widgets and grouped settings, not for records. */
export function Panel({
  title,
  description,
  actions,
  children,
  padding = 4,
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  padding?: 0 | 2 | 3 | 4 | 5
}) {
  return (
    <Card padding={0}>
      <VStack gap={0}>
        {(title || actions) && (
          <HStack gap={3} vAlign="center" paddingInline={4} paddingBlock={3} style={{ borderBottom: 'var(--border-width) solid var(--color-border)' }}>
            <StackItem size="fill">
              <VStack gap={0.5}>
                {title && <Heading level={3}>{title}</Heading>}
                {description && (
                  <Text type="supporting" color="secondary">
                    {description}
                  </Text>
                )}
              </VStack>
            </StackItem>
            {actions}
          </HStack>
        )}
        <VStack gap={3} padding={padding}>
          {children}
        </VStack>
      </VStack>
    </Card>
  )
}

/** Relative time with the absolute timestamp on hover. */
export function When({ value, empty = '—' }: { value?: string | null; empty?: string }) {
  if (!value) return <Text color="secondary">{empty}</Text>
  return (
    <Tooltip content={dateTime(value)}>
      <Text className="ds-nowrap">{relativeTime(value)}</Text>
    </Tooltip>
  )
}

/** Monospace value with a copy button (tokens, commands, IDs). */
export function CopyValue({ value, label = 'Copy', display }: { value: string; label?: string; display?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  return (
    <HStack gap={1} vAlign="center">
      <span className="ds-mono ds-truncate" title={value}>
        {display ?? value}
      </span>
      <IconButton
        label={copied ? 'Copied' : label}
        size="sm"
        variant="ghost"
        icon={copied ? <Check size={14} /> : <Copy size={14} />}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          } catch {
            /* clipboard blocked */
          }
        }}
      />
    </HStack>
  )
}

/** Toast helpers with consistent wording. */
export function useNotify() {
  const toast = useToast()
  return {
    success: (body: string) => toast({ body }),
    error: (e: unknown, prefix?: string) =>
      toast({ body: prefix ? `${prefix}: ${errorMessage(e)}` : errorMessage(e), type: 'error' }),
  }
}

/**
 * Confirmation dialog for destructive or irreversible actions. When
 * `confirmText` is set the user must type it before the action enables.
 */
export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  actionLabel,
  onConfirm,
  confirmText,
  isLoading,
  error,
  children,
  variant = 'destructive',
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  actionLabel: string
  onConfirm: () => void
  confirmText?: string
  isLoading?: boolean
  error?: unknown
  children?: ReactNode
  variant?: 'destructive' | 'primary'
}) {
  const [typed, setTyped] = useState('')
  const ready = !confirmText || typed === confirmText
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(o) => {
        if (!o) setTyped('')
        onOpenChange(o)
      }}
      purpose="form"
      width={480}
    >
      <Layout
        height="auto"
        header={<DialogHeader title={title} onOpenChange={onOpenChange} />}
        content={
          <LayoutContent padding={4}>
            <VStack gap={3}>
              <Text>{description}</Text>
              {children}
              {confirmText && (
                <TextInput
                  label={`Type "${confirmText}" to confirm`}
                  value={typed}
                  onChange={(v) => setTyped(v)}
                  autoComplete="off"
                />
              )}
              {error ? <Banner status="error" title={errorMessage(error)} /> : null}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter padding={4}>
            <HStack gap={2} hAlign="end">
              <Button label="Cancel" onClick={() => onOpenChange(false)} />
              <Button label={actionLabel} variant={variant} isDisabled={!ready} isLoading={isLoading} onClick={onConfirm} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}

/** Inline key/value grid for compact facts inside panels. */
export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, max-content) 1fr', gap: 'var(--spacing-2) var(--spacing-4)', margin: 0 }}>
      {items.map((it) => (
        <div key={it.label} style={{ display: 'contents' }}>
          <dt>
            <Text type="supporting" color="secondary">
              {it.label}
            </Text>
          </dt>
          <dd style={{ margin: 0, minWidth: 0 }}>{typeof it.value === 'string' ? <Text>{it.value}</Text> : it.value}</dd>
        </div>
      ))}
    </dl>
  )
}
