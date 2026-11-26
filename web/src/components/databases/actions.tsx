// Database actions reused by the list, detail and schedules pages.
import { useEffect, useState, type ReactNode } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter, HStack, VStack } from '@astryxdesign/core/Layout'
import { Divider } from '@astryxdesign/core/Divider'
import { Heading, Text } from '@astryxdesign/core/Text'
import { useToast } from '@astryxdesign/core/Toast'
import { useNavigate } from '@tanstack/react-router'
import {
  useBackups,
  useDatabase,
  useDatabaseConnection,
  useDeleteDatabase,
  usePauseDatabase,
  useSaveDatabase,
  useTriggerBackup,
} from '@/lib/api/hooks'
import { ApiError, errorMessage } from '@/lib/api/client'
import type { Database, RotationPolicy } from '@/lib/api/types'
import { ConfirmDialog, useNotify } from '@/components/common'
import { BlockSkeleton } from '@/components/states'
import { databaseInputFrom, needsConnectionView } from './connection'
import { RetentionEditor } from './RetentionEditor'
import { ScheduleEditor, useScheduleCheck, type ScheduleValue } from './ScheduleEditor'
import { validateRetention } from './schedule'

/**
 * Start a manual backup. On 409 (one already running) the toast links to the
 * running backup instead of reporting a failure.
 */
export function useBackupNow() {
  const trigger = useTriggerBackup()
  const toast = useToast()
  const navigate = useNavigate()
  const run = async (db: Pick<Database, 'id' | 'name'>) => {
    try {
      const b = await trigger.mutateAsync(db.id)
      toast({
        body: `Backup of ${db.name} queued`,
        endContent: <Button label="View" size="sm" variant="ghost" onClick={() => navigate({ to: '/backups/$id', params: { id: b.id } })} />,
      })
      return b
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const running = (e.body?.backup as { id?: string } | undefined)?.id
        toast({
          body: `A backup of ${db.name} is already running`,
          endContent: running ? (
            <Button label="View running backup" size="sm" variant="ghost" onClick={() => navigate({ to: '/backups/$id', params: { id: running } })} />
          ) : undefined,
        })
        return undefined
      }
      toast({ body: `Could not start backup: ${errorMessage(e)}`, type: 'error' })
      return undefined
    }
  }
  return { run, isPending: trigger.isPending, pendingId: trigger.isPending ? trigger.variables : undefined }
}

/** Pause or resume scheduled backups with a toast. */
export function usePauseToggle() {
  const pause = usePauseDatabase()
  const notify = useNotify()
  const toggle = async (db: Pick<Database, 'id' | 'name' | 'paused'>) => {
    try {
      await pause.mutateAsync({ id: db.id, paused: !db.paused })
      notify.success(db.paused ? `Scheduled backups for ${db.name} resumed` : `Scheduled backups for ${db.name} paused`)
    } catch (e) {
      notify.error(e, db.paused ? 'Could not resume' : 'Could not pause')
    }
  }
  return { toggle, isPending: pause.isPending, pendingId: pause.isPending ? pause.variables?.id : undefined }
}

/**
 * Delete confirmation with typed-name confirmation and an opt-in checkbox to
 * also delete stored backups from storage.
 */
export function DeleteDatabaseDialog({
  database,
  isOpen,
  onOpenChange,
  onDeleted,
}: {
  database: Pick<Database, 'id' | 'name'> | null
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}) {
  const del = useDeleteDatabase()
  const notify = useNotify()
  const [withBackups, setWithBackups] = useState(false)
  const stored = useBackups({ database_id: database?.id, status: 'success', limit: 1 }, { enabled: isOpen && !!database })
  const count = stored.data?.total ?? 0
  useEffect(() => {
    if (!isOpen) {
      setWithBackups(false)
      del.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])
  if (!database) return null
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Delete ${database.name}?`}
      description={
        withBackups
          ? 'The database configuration, its schedule and its stored backup files will be removed. This cannot be undone.'
          : 'The database configuration and its schedule will be removed. Backup records and files stay in storage and can still be downloaded or restored.'
      }
      actionLabel={withBackups ? 'Delete database and backups' : 'Delete database'}
      confirmText={database.name}
      isLoading={del.isPending}
      error={del.error}
      onConfirm={async () => {
        try {
          await del.mutateAsync({ id: database.id, deleteBackups: withBackups })
          notify.success(`${database.name} deleted`)
          onOpenChange(false)
          onDeleted?.()
        } catch {
          /* shown in dialog */
        }
      }}
    >
      <CheckboxInput
        label={`Also delete ${count} stored ${count === 1 ? 'backup' : 'backups'} from storage`}
        description="Permanently removes the backup files from the storage destination."
        value={withBackups}
        onChange={setWithBackups}
        isDisabled={count === 0}
      />
    </ConfirmDialog>
  )
}

/**
 * Quick edit of a database's schedule and retention. Loads the full
 * configuration so the PUT keeps every other field unchanged.
 */
export function ScheduleDialog({
  databaseId,
  isOpen,
  onOpenChange,
}: {
  databaseId: string | null
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={640}>
      {databaseId && isOpen ? <ScheduleDialogBody id={databaseId} onClose={() => onOpenChange(false)} /> : <span />}
    </Dialog>
  )
}

function ScheduleDialogBody({ id, onClose }: { id: string; onClose: () => void }) {
  const db = useDatabase(id)
  const needConn = db.data ? needsConnectionView(db.data) : false
  const conn = useDatabaseConnection(id, needConn)
  const ready = db.data && (!needConn || conn.data)
  const loadError = db.error || (needConn ? conn.error : null)

  const header = <DialogHeader title={db.data ? `Schedule · ${db.data.name}` : 'Schedule'} onOpenChange={() => onClose()} />
  if (ready && !loadError)
    return <ScheduleRetentionForm key={db.data!.updated_at} database={db.data!} connection={conn.data} onDone={onClose} dialogHeader={header} />
  return (
    <Layout
      height="auto"
      header={header}
      content={
        <LayoutContent padding={4}>
          {loadError ? (
            <Banner status="error" title="Could not load the database" description={errorMessage(loadError)} />
          ) : (
            <BlockSkeleton height={320} />
          )}
        </LayoutContent>
      }
    />
  )
}

/** Inline schedule + retention form used by the dialog and the detail page. */
export function ScheduleRetentionForm({
  database,
  connection,
  onDone,
  onDirtyChange,
  layout = 'dialog',
  isDisabled,
  dialogHeader,
}: {
  database: Database
  connection?: { host: string; port: number; dbname: string; user: string; has_password: boolean }
  onDone?: () => void
  onDirtyChange?: (dirty: boolean) => void
  layout?: 'dialog' | 'page'
  isDisabled?: boolean
  /** Dialog mode: header rendered above the scrolling body, with actions pinned in the footer. */
  dialogHeader?: ReactNode
}) {
  const save = useSaveDatabase(database.id)
  const notify = useNotify()
  const initial = { cron: database.schedule, timezone: database.timezone ?? '' }
  const [schedule, setSchedule] = useState<ScheduleValue>(initial)
  const [retention, setRetention] = useState<RotationPolicy>(database.rotation_policy)
  const check = useScheduleCheck(schedule.cron, schedule.timezone)
  const dirty =
    schedule.cron !== initial.cron ||
    schedule.timezone !== initial.timezone ||
    retention.type !== database.rotation_policy.type ||
    retention.value !== database.rotation_policy.value
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange])
  const retentionError = validateRetention(retention)
  const canSave = dirty && check.valid && !retentionError && !isDisabled

  const submit = async () => {
    try {
      await save.mutateAsync(
        databaseInputFrom(database, connection, { schedule: schedule.cron.trim(), timezone: schedule.timezone, rotation_policy: retention }),
      )
      notify.success('Schedule saved')
      onDirtyChange?.(false)
      onDone?.()
    } catch {
      /* shown below */
    }
  }

  const reset = () => {
    setSchedule(initial)
    setRetention(database.rotation_policy)
    save.reset()
  }

  const body = (
    <VStack gap={5}>
      <VStack gap={3}>
        {layout === 'page' && <Heading level={3}>Schedule</Heading>}
        <ScheduleEditor value={schedule} onChange={setSchedule} isDisabled={isDisabled} />
      </VStack>
      <Divider />
      <VStack gap={3}>
        {layout === 'page' ? <Heading level={3}>Retention</Heading> : <Text weight="semibold">Retention</Text>}
        <RetentionEditor value={retention} onChange={setRetention} isDisabled={isDisabled} />
      </VStack>
      {database.paused && (
        <Banner status="info" title="Scheduled backups are paused" description="The schedule is saved but will not run until you resume it." />
      )}
      {save.error ? <Banner status="error" title="Could not save" description={errorMessage(save.error)} /> : null}
    </VStack>
  )

  const actions = (
    <HStack gap={2} hAlign="end">
      {layout === 'dialog' ? (
        <Button label="Cancel" onClick={() => onDone?.()} />
      ) : (
        <Button label="Discard changes" onClick={reset} isDisabled={!dirty || save.isPending} />
      )}
      <Button label="Save schedule" variant="primary" onClick={submit} isLoading={save.isPending} isDisabled={!canSave} />
    </HStack>
  )

  if (layout === 'dialog')
    return (
      <Layout
        height="auto"
        header={dialogHeader}
        content={<LayoutContent padding={4}>{body}</LayoutContent>}
        footer={<LayoutFooter padding={4}>{actions}</LayoutFooter>}
      />
    )
  return (
    <VStack gap={5}>
      {body}
      {actions}
    </VStack>
  )
}
