import { useEffect, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Selector } from '@astryxdesign/core/Selector'
import { Text } from '@astryxdesign/core/Text'
import { useNotify } from '@/components/common'
import { BlockSkeleton } from '@/components/states'
import { useDatabaseConnection, useNotifications, useSaveDatabase, useStorages } from '@/lib/api/hooks'
import type { Database } from '@/lib/api/types'
import { errorMessage } from '@/lib/api/client'
import { PROVIDER_LABEL } from '@/lib/format'
import { databaseInputFrom, needsConnectionView } from './connection'

/** Storage destination and notification channel of a database. */
export function DetailStorage({
  db,
  onDirtyChange,
  isDisabled,
}: {
  db: Database
  onDirtyChange: (dirty: boolean) => void
  isDisabled?: boolean
}) {
  const needConn = needsConnectionView(db)
  const conn = useDatabaseConnection(db.id, needConn && !isDisabled)
  const storages = useStorages()
  const notifications = useNotifications()
  const save = useSaveDatabase(db.id)
  const notify = useNotify()
  const [storageId, setStorageId] = useState(db.storage_id)
  const [notificationId, setNotificationId] = useState<string | null>(db.notification_id ?? null)

  useEffect(() => {
    setStorageId(db.storage_id)
    setNotificationId(db.notification_id ?? null)
  }, [db.storage_id, db.notification_id])

  const dirty = storageId !== db.storage_id || (notificationId ?? null) !== (db.notification_id ?? null)
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  if (storages.isLoading || (needConn && !isDisabled && conn.isLoading)) return <BlockSkeleton height={200} />
  if (needConn && conn.error) return <Banner status="error" title="Could not load the database configuration" description={errorMessage(conn.error)} />

  const submit = async () => {
    try {
      await save.mutateAsync(databaseInputFrom(db, conn.data, { storage_id: storageId, notification_id: notificationId }))
      notify.success('Saved')
      onDirtyChange(false)
    } catch {
      /* banner below */
    }
  }

  return (
    <VStack gap={5} maxWidth={640}>
      <VStack gap={2}>
        <Selector
          label="Storage destination"
          options={(storages.data ?? []).map((s) => ({
            value: s.id,
            label: s.is_default ? `${s.name} (default)` : s.name,
            description: `${PROVIDER_LABEL[s.provider] ?? s.provider}${s.bucket ? ` · ${s.bucket}` : ''}`,
          }))}
          value={storageId}
          onChange={(v) => v && setStorageId(v)}
          isDisabled={isDisabled}
          description="New backups upload here. Existing backups stay where they were stored and can still be restored."
        />
        <Text type="supporting" color="secondary">
          Manage destinations on the <Link href="/storage" type="inherit">Storage</Link> page.
        </Text>
      </VStack>
      <VStack gap={2}>
        <Selector
          label="Notification channel"
          options={(notifications.data ?? []).map((n) => ({
            value: n.id,
            label: n.name,
            description: [n.has_discord && 'Discord', n.has_telegram && 'Telegram'].filter(Boolean).join(' · ') || undefined,
          }))}
          value={notificationId}
          hasClear
          placeholder="No notifications"
          emptyText="No channels yet"
          onChange={setNotificationId}
          isDisabled={isDisabled}
          description="Backup successes and failures are sent to this channel."
        />
        <Text type="supporting" color="secondary">
          Manage channels on the <Link href="/notifications" type="inherit">Notifications</Link> page.
        </Text>
      </VStack>
      {save.error ? <Banner status="error" title="Could not save" description={errorMessage(save.error)} /> : null}
      <HStack gap={2} hAlign="end">
        <Button
          label="Discard changes"
          onClick={() => {
            setStorageId(db.storage_id)
            setNotificationId(db.notification_id ?? null)
            save.reset()
          }}
          isDisabled={!dirty || save.isPending}
        />
        <Button label="Save" variant="primary" onClick={submit} isLoading={save.isPending} isDisabled={!dirty || isDisabled} />
      </HStack>
    </VStack>
  )
}
