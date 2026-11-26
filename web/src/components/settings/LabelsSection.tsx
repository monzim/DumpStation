import { useEffect, useMemo, useState } from 'react'
import { Table, proportional, pixel, useTableSortable, useTableSortableState, type TableColumn } from '@astryxdesign/core/Table'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { HStack, Layout, LayoutContent, LayoutFooter, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Button } from '@astryxdesign/core/Button'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TextArea } from '@astryxdesign/core/TextArea'
import { Banner } from '@astryxdesign/core/Banner'
import { Field } from '@astryxdesign/core/Field'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { Plus, Pencil, Trash2, Tags, Check } from 'lucide-react'
import { ConfirmDialog, When, useNotify } from '@/components/common'
import { Empty, ErrorState, TableSkeleton } from '@/components/states'
import { useLabels, useMe } from '@/lib/api/hooks'
import { ApiError, errorMessage } from '@/lib/api/client'
import type { LabelWithUsage } from '@/lib/api/types'
import { useDeleteLabel, useSaveLabel, type LabelInput } from './api'

// Label colors are user data stored on the server as hex; these are the presets offered.
const PRESETS = ['#64748b', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899']
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

type Row = LabelWithUsage & Record<string, unknown>

export function Swatch({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: HEX.test(color) ? color : 'var(--color-border)',
        boxShadow: 'inset 0 0 0 1px var(--color-border)',
        flexShrink: 0,
      }}
    />
  )
}

function usage(l: LabelWithUsage) {
  const parts = [
    l.database_count && `${l.database_count} ${l.database_count === 1 ? 'database' : 'databases'}`,
    l.storage_count && `${l.storage_count} storage`,
    l.notification_count && `${l.notification_count} ${l.notification_count === 1 ? 'channel' : 'channels'}`,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Unused'
}

export function LabelsSection() {
  const labels = useLabels()
  const me = useMe()
  const readOnly = !!me.data?.is_demo
  const notify = useNotify()
  const del = useDeleteLabel()
  const [editing, setEditing] = useState<LabelWithUsage | undefined>()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState<LabelWithUsage | null>(null)
  const [q, setQ] = useState('')

  const rows = useMemo(
    () => ((labels.data ?? []) as Row[]).filter((l) => !q || `${l.name} ${l.description ?? ''}`.toLowerCase().includes(q.toLowerCase())),
    [labels.data, q],
  )
  const { sortedData, sortConfig } = useTableSortableState<Row>({ data: rows, defaultSort: [{ sortKey: 'name', direction: 'ascending' }] })
  const sort = useTableSortable<Row>(sortConfig)

  const openNew = () => {
    setEditing(undefined)
    setDialogOpen(true)
  }

  const columns: TableColumn<Row>[] = [
    {
      key: 'name',
      header: 'Label',
      sortable: true,
      width: proportional(2, { minWidth: 160 }),
      renderCell: (l) => (
        <HStack gap={2} vAlign="center">
          <Swatch color={l.color} />
          <Text weight="medium">{l.name}</Text>
        </HStack>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      width: proportional(3, { minWidth: 180 }),
      renderCell: (l) => (l.description ? <Text color="secondary">{l.description}</Text> : <Text color="disabled">—</Text>),
    },
    {
      key: 'total_usage',
      header: 'Used by',
      sortable: true,
      width: proportional(2, { minWidth: 160 }),
      renderCell: (l) => <Text type="supporting" color={l.total_usage ? undefined : 'secondary'}>{usage(l)}</Text>,
    },
    { key: 'created_at', header: 'Created', sortable: true, width: pixel(120), renderCell: (l) => <When value={l.created_at} /> },
    {
      key: 'actions',
      header: '',
      align: 'end',
      width: pixel(56),
      renderCell: (l) => (
        <MoreMenu
          label={`Actions for ${l.name}`}
          size="sm"
          isDisabled={readOnly}
          items={[
            {
              label: 'Edit',
              icon: <Pencil size={14} />,
              onClick: () => {
                setEditing(l)
                setDialogOpen(true)
              },
            },
            { type: 'divider' },
            { label: 'Delete', icon: <Trash2 size={14} />, variant: 'destructive', onClick: () => setDeleting(l) },
          ]}
        />
      ),
    },
  ]

  return (
    <VStack gap={3}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <StackItem size="fill">
          <Text color="secondary">Labels group databases, storage and notification channels so you can filter and find them quickly.</Text>
        </StackItem>
        <TextInput label="Filter labels" isLabelHidden placeholder="Filter labels" startIcon="search" value={q} onChange={setQ} hasClear width={220} />
        <Button label="New label" variant="primary" icon={<Plus size={16} />} onClick={openNew} isDisabled={readOnly} />
      </HStack>
      {labels.isLoading ? (
        <TableSkeleton rows={4} />
      ) : labels.error ? (
        <ErrorState error={labels.error} onRetry={() => labels.refetch()} />
      ) : !labels.data?.length ? (
        <Card>
          <Empty
            title="No labels yet"
            description="Create labels such as production, staging or team names, then assign them from a database, storage or notification page."
            icon={<Tags size={28} />}
            actions={!readOnly ? <Button label="New label" variant="primary" icon={<Plus size={16} />} onClick={openNew} /> : undefined}
          />
        </Card>
      ) : (
        <Card padding={0} style={{ overflowX: 'auto' }}>
          <Table<Row>
            data={sortedData}
            columns={columns}
            idKey="id"
            density="compact"
            hasHover
            plugins={{ sort }}
            emptyState={<Empty title="No labels match" description="Try a different filter." />}
          />
        </Card>
      )}
      <LabelDialog isOpen={dialogOpen} onOpenChange={setDialogOpen} label={editing} existing={labels.data ?? []} />
      <ConfirmDialog
        isOpen={!!deleting}
        onOpenChange={(o) => {
          if (!o) {
            setDeleting(null)
            del.reset()
          }
        }}
        title="Delete label"
        description={
          <>
            Delete <strong>{deleting?.name}</strong>?{' '}
            {deleting?.total_usage
              ? `It is removed from ${usage(deleting)}. The resources themselves are not changed.`
              : 'It is not assigned to anything.'}
          </>
        }
        actionLabel="Delete label"
        isLoading={del.isPending}
        error={del.error}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await del.mutateAsync(deleting.id)
            notify.success(`Deleted label ${deleting.name}`)
            setDeleting(null)
          } catch {
            /* inline */
          }
        }}
      />
    </VStack>
  )
}

function LabelDialog({
  isOpen,
  onOpenChange,
  label,
  existing,
}: {
  isOpen: boolean
  onOpenChange: (o: boolean) => void
  label?: LabelWithUsage
  existing: LabelWithUsage[]
}) {
  const notify = useNotify()
  const save = useSaveLabel(label?.id)
  const [form, setForm] = useState<LabelInput>({ name: '', color: PRESETS[7], description: '' })
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (!isOpen) return
    setTouched(false)
    save.reset()
    setForm(label ? { name: label.name, color: label.color, description: label.description ?? '' } : { name: '', color: PRESETS[7], description: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, label])

  const fe = save.error instanceof ApiError ? save.error.fieldErrors : {}
  const dup = existing.some((l) => l.id !== label?.id && l.name.trim().toLowerCase() === form.name.trim().toLowerCase())
  const errors = {
    name: !form.name.trim() ? 'Name is required' : form.name.length > 100 ? 'Use at most 100 characters' : dup ? 'A label with this name already exists' : fe.name,
    color: !HEX.test(form.color) ? 'Use a hex color such as #3b82f6' : fe.color,
    description: form.description.length > 255 ? 'Use at most 255 characters' : fe.description,
  }
  const st = (k: keyof typeof errors) => (touched && errors[k] ? { type: 'error' as const, message: errors[k] } : undefined)

  const submit = async () => {
    setTouched(true)
    if (Object.values(errors).some(Boolean)) return
    try {
      await save.mutateAsync({ name: form.name.trim(), color: form.color.toLowerCase(), description: form.description.trim() })
      notify.success(label ? `Saved ${form.name.trim()}` : `Created ${form.name.trim()}`)
      onOpenChange(false)
    } catch {
      /* inline */
    }
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={480}>
      <Layout
        height="auto"
        header={<DialogHeader title={label ? `Edit ${label.name}` : 'New label'} onOpenChange={onOpenChange} />}
        content={
          <LayoutContent padding={4}>
            <form
              id="label-form"
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              <VStack gap={3}>
                <TextInput label="Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} isRequired hasAutoFocus status={st('name')} />
                <Field label="Color" inputID="label-color-hex" status={st('color')}>
                  <VStack gap={2}>
                    <HStack gap={1} wrap="wrap" role="radiogroup" aria-label="Preset colors">
                      {PRESETS.map((c) => {
                        const selected = form.color.toLowerCase() === c
                        return (
                          <Tooltip key={c} content={c}>
                            <button
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              aria-label={c}
                              onClick={() => setForm((f) => ({ ...f, color: c }))}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: '50%',
                                border: selected ? '2px solid var(--color-text-primary)' : 'var(--border-width) solid var(--color-border)',
                                background: c,
                                cursor: 'pointer',
                                display: 'grid',
                                placeItems: 'center',
                                padding: 0,
                                color: 'white',
                              }}
                            >
                              {selected && <Check size={14} />}
                            </button>
                          </Tooltip>
                        )
                      })}
                    </HStack>
                    <HStack gap={2} vAlign="center">
                      <Swatch color={form.color} size={20} />
                      <TextInput
                        label="Hex color"
                        isLabelHidden
                        value={form.color}
                        onChange={(v) => setForm((f) => ({ ...f, color: v.trim() }))}
                        width={140}
                        controlClassName="ds-mono"
                      />
                    </HStack>
                  </VStack>
                </Field>
                <TextArea
                  label="Description"
                  isOptional
                  value={form.description}
                  onChange={(v) => setForm((f) => ({ ...f, description: v }))}
                  rows={2}
                  maxLength={255}
                  status={st('description')}
                />
                {save.error ? <Banner status="error" title="Could not save label" description={errorMessage(save.error)} /> : null}
                <button type="submit" hidden aria-hidden tabIndex={-1} />
              </VStack>
            </form>
          </LayoutContent>
        }
        footer={
          <LayoutFooter padding={4}>
            <HStack gap={2} hAlign="end">
              <Button label="Cancel" onClick={() => onOpenChange(false)} />
              <Button label={label ? 'Save changes' : 'Create label'} variant="primary" type="submit" form="label-form" isLoading={save.isPending} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
