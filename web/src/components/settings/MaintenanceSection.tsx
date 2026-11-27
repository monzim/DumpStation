import { useState } from 'react'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Button } from '@astryxdesign/core/Button'
import { Text } from '@astryxdesign/core/Text'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { Trash2 } from 'lucide-react'
import { Panel, ConfirmDialog, useNotify } from '@/components/common'
import { ErrorState } from '@/components/states'
import { useFailedBackupCount, useMe, usePurgeFailedBackups } from '@/lib/api/hooks'

export function MaintenanceSection() {
  const count = useFailedBackupCount()
  const purge = usePurgeFailedBackups()
  const me = useMe()
  const notify = useNotify()
  const [open, setOpen] = useState(false)
  const readOnly = !!me.data?.is_demo
  const n = count.data?.count ?? 0

  return (
    <VStack gap={4}>
      <Panel
        title="Purge failed backups"
        description="Failed runs stay in the backup history so you can investigate them. Purging deletes those records and any partial objects they left in storage. Successful backups, restores and the activity log are not touched."
      >
        {count.isLoading ? (
          <Skeleton height={40} />
        ) : count.error ? (
          <ErrorState error={count.error} onRetry={() => count.refetch()} title="Could not count failed backups" />
        ) : (
          <HStack gap={3} vAlign="center" wrap="wrap">
            <StackItem size="fill">
              <VStack gap={0.5}>
                <Text className="ds-metric-value" hasTabularNumbers>
                  {n.toLocaleString()}
                </Text>
                <Text type="supporting" color="secondary">
                  {n === 1 ? 'failed backup record' : 'failed backup records'}
                </Text>
              </VStack>
            </StackItem>
            <Button label="Review failed backups" href="/backups?status=failed" isDisabled={n === 0} />
            <Button
              label="Purge failed backups"
              variant="destructive"
              icon={<Trash2 size={14} />}
              onClick={() => setOpen(true)}
              isDisabled={readOnly || n === 0}
              tooltip={readOnly ? 'The demo account is read-only' : n === 0 ? 'Nothing to purge' : undefined}
            />
          </HStack>
        )}
      </Panel>
      <ConfirmDialog
        isOpen={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) purge.reset()
        }}
        title="Purge failed backups"
        description={
          <>
            Permanently delete <strong>{n.toLocaleString()}</strong> failed backup {n === 1 ? 'record' : 'records'} and any partial files left in storage. The error
            details will no longer be available for troubleshooting. This cannot be undone.
          </>
        }
        actionLabel={`Purge ${n.toLocaleString()} failed ${n === 1 ? 'backup' : 'backups'}`}
        isLoading={purge.isPending}
        error={purge.error}
        onConfirm={async () => {
          try {
            const r = await purge.mutateAsync()
            notify.success(`Purged ${(r?.deleted ?? n).toLocaleString()} failed backups`)
            setOpen(false)
          } catch {
            /* inline */
          }
        }}
      />
    </VStack>
  )
}
