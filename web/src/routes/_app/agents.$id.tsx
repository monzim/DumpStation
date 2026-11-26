import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Button } from '@astryxdesign/core/Button'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { TabList, Tab } from '@astryxdesign/core/TabList'
import { Text } from '@astryxdesign/core/Text'
import { Banner } from '@astryxdesign/core/Banner'
import { Badge } from '@astryxdesign/core/Badge'
import { Pencil, Pause, Play, KeyRound, Ban, Trash2 } from 'lucide-react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { ConfirmDialog, When, useNotify } from '@/components/common'
import { AgentConnectivityBadge } from '@/components/status'
import { BlockSkeleton, ErrorState } from '@/components/states'
import { useAgent, useAgentAction, useDeleteAgent } from '@/lib/api/hooks'
import { ApiError } from '@/lib/api/client'
import { useSession } from '@/lib/auth/session'
import type { Agent } from '@/lib/api/types'
import { LabelTokens, normalizeAgent } from '@/components/agents/AgentBits'
import { EditAgentDialog, RotateCredentialDialog } from '@/components/agents/AgentDialogs'
import { ActivityTab, ConfigurationTab, ConnectionsTab, DatabasesTab, HistoryTab, OverviewTab } from '@/components/agents/AgentTabs'

const TABS = ['overview', 'databases', 'connections', 'history', 'activity', 'configuration'] as const
type TabKey = (typeof TABS)[number]

interface Search {
  tab?: TabKey
  page?: number
}

export const Route = createFileRoute('/_app/agents/$id')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    tab: TABS.includes(s.tab as TabKey) && s.tab !== 'overview' ? (s.tab as TabKey) : undefined,
    page: Number(s.page) > 1 ? Math.floor(Number(s.page)) : undefined,
  }),
  component: AgentPage,
})

function AgentPage() {
  const { id } = Route.useParams()
  const q = useAgent(id)
  if (q.isLoading)
    return (
      <Page>
        <BlockSkeleton height={64} />
        <BlockSkeleton height={280} />
      </Page>
    )
  if (q.error && !q.data)
    return (
      <Page>
        <PageHeader title="Agent" crumbs={[{ label: 'Backup Agents', href: '/agents' }, { label: 'Agent' }]} />
        <ErrorState
          error={q.error}
          title={q.error instanceof ApiError && q.error.status === 404 ? 'Agent not found' : 'Could not load this agent'}
          onRetry={() => q.refetch()}
        />
      </Page>
    )
  return <AgentDetail agent={normalizeAgent(q.data!)} />
}

function AgentDetail({ agent: a }: { agent: Agent }) {
  const { tab = 'overview', page = 1 } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { isDemo } = useSession()
  const notify = useNotify()
  const action = useAgentAction()
  const del = useDeleteAgent()
  const [dialog, setDialog] = useState<'edit' | 'rotate' | 'revoke' | 'delete' | 'disable' | null>(null)

  const setTab = (t: string) => navigate({ search: { tab: t === 'overview' ? undefined : (t as TabKey) } })
  const run = (act: 'enable' | 'disable' | 'revoke', done: string) =>
    action.mutate(
      { id: a.id, action: act },
      {
        onSuccess: () => {
          notify.success(done)
          setDialog(null)
        },
        onError: (e) => {
          if (act === 'enable') notify.error(e, 'Could not enable the agent')
        },
      },
    )

  const revoked = a.status === 'revoked'
  const canDelete = a.database_count === 0

  return (
    <Page>
      <PageHeader
        title={a.name}
        crumbs={[{ label: 'Backup Agents', href: '/agents' }, { label: a.name }]}
        description={a.description || undefined}
        actions={
          <>
            <Button label="Edit" icon={<Pencil size={16} />} onClick={() => setDialog('edit')} isDisabled={isDemo} />
            {a.status === 'active' && (
              <Button label="Disable" icon={<Pause size={16} />} onClick={() => setDialog('disable')} isDisabled={isDemo} />
            )}
            {a.status === 'disabled' && (
              <Button label="Enable" icon={<Play size={16} />} isLoading={action.isPending} onClick={() => run('enable', 'Agent enabled')} isDisabled={isDemo} />
            )}
            <MoreMenu
              label="More agent actions"
              variant="secondary"
              isDisabled={isDemo}
              alignment="end"
              items={[
                {
                  label: revoked ? 'Re-enroll…' : a.status === 'pending' ? 'Issue new enrollment token…' : 'Rotate credential / redeploy…',
                  icon: <KeyRound size={16} />,
                  onClick: () => setDialog('rotate'),
                },
                { type: 'divider' },
                {
                  label: 'Revoke…',
                  icon: <Ban size={16} />,
                  variant: 'destructive',
                  isDisabled: revoked,
                  description: revoked ? 'Already revoked' : undefined,
                  onClick: () => setDialog('revoke'),
                },
                {
                  label: 'Delete…',
                  icon: <Trash2 size={16} />,
                  variant: 'destructive',
                  isDisabled: !canDelete,
                  description: canDelete ? undefined : `Reassign its ${a.database_count} ${a.database_count === 1 ? 'database' : 'databases'} first`,
                  onClick: () => setDialog('delete'),
                },
              ]}
            />
          </>
        }
        meta={
          <HStack gap={3} vAlign="center" wrap="wrap">
            <AgentConnectivityBadge status={a.status} connectivity={a.connectivity} />
            <Text type="supporting" color="secondary">
              Last heartbeat <When value={a.last_seen_at} empty="never" />
            </Text>
            {a.running_jobs > 0 && <Badge variant="info" label={`${a.running_jobs} running`} />}
            <LabelTokens labels={a.labels} max={6} />
          </HStack>
        }
      />

      <StatusNotice agent={a} onRotate={() => setDialog('rotate')} />

      <VStack gap={4}>
        <TabList value={tab} onChange={setTab} hasDivider overflow="auto" role="tablist" aria-label="Agent sections">
          <Tab value="overview" label="Overview" />
          <Tab value="databases" label="Databases" endContent={<Badge label={String(a.database_count)} />} />
          <Tab value="connections" label="Connections" endContent={<Badge label={String(a.connections.length)} />} />
          <Tab value="history" label="Execution history" />
          <Tab value="activity" label="Activity" />
          <Tab value="configuration" label="Configuration" />
        </TabList>
        {tab === 'overview' && <OverviewTab agent={a} />}
        {tab === 'databases' && <DatabasesTab agent={a} />}
        {tab === 'connections' && <ConnectionsTab agent={a} />}
        {tab === 'history' && <HistoryTab agent={a} page={page} onPage={(p) => navigate({ search: (s) => ({ ...s, page: p > 1 ? p : undefined }) })} />}
        {tab === 'activity' && <ActivityTab agent={a} />}
        {tab === 'configuration' && <ConfigurationTab agent={a} />}
      </VStack>

      <EditAgentDialog agent={a} isOpen={dialog === 'edit'} onOpenChange={(o) => setDialog(o ? 'edit' : null)} />
      <RotateCredentialDialog agent={a} isOpen={dialog === 'rotate'} onOpenChange={(o) => setDialog(o ? 'rotate' : null)} />
      <ConfirmDialog
        isOpen={dialog === 'disable'}
        onOpenChange={(o) => setDialog(o ? 'disable' : null)}
        title={`Disable ${a.name}?`}
        description="The agent stays enrolled but receives no new jobs. Scheduled backups of its databases wait for an agent and then fail until you enable it again."
        actionLabel="Disable agent"
        variant="primary"
        isLoading={action.isPending}
        error={dialog === 'disable' ? action.error : undefined}
        onConfirm={() => run('disable', 'Agent disabled')}
      />
      <ConfirmDialog
        isOpen={dialog === 'revoke'}
        onOpenChange={(o) => {
          if (!o) action.reset()
          setDialog(o ? 'revoke' : null)
        }}
        title={`Revoke ${a.name}?`}
        description="The agent's credential stops working immediately and it can no longer pick up jobs. Backups of its assigned databases fail until you re-enroll it with a new token."
        actionLabel="Revoke agent"
        confirmText={a.name}
        isLoading={action.isPending}
        error={dialog === 'revoke' ? action.error : undefined}
        onConfirm={() => run('revoke', 'Agent revoked')}
      />
      <ConfirmDialog
        isOpen={dialog === 'delete'}
        onOpenChange={(o) => {
          if (!o) del.reset()
          setDialog(o ? 'delete' : null)
        }}
        title={`Delete ${a.name}?`}
        description="The agent and its credential are removed permanently. Its execution history stays on the backups it ran."
        actionLabel="Delete agent"
        confirmText={a.name}
        isLoading={del.isPending}
        error={del.error}
        onConfirm={() =>
          del.mutate(a.id, {
            onSuccess: () => {
              notify.success(`Agent ${a.name} deleted`)
              navigate({ to: '/agents' })
            },
          })
        }
      />
    </Page>
  )
}

function StatusNotice({ agent: a, onRotate }: { agent: Agent; onRotate: () => void }) {
  if (a.status === 'revoked')
    return (
      <Banner
        status="error"
        title="This agent is revoked"
        description="Its credential no longer works. Backups of assigned databases fail until it is re-enrolled with a new token."
        endContent={<Button label="Re-enroll" size="sm" onClick={onRotate} />}
      />
    )
  if (a.status === 'pending')
    return (
      <Banner
        status="warning"
        title="Waiting for the agent to enroll"
        description="Deploy the agent with its enrollment token. If the token expired or was lost, issue a new one."
        endContent={<Button label="Issue token" size="sm" onClick={onRotate} />}
      />
    )
  if (a.status === 'disabled')
    return <Banner status="info" title="This agent is disabled" description="It stays enrolled but receives no jobs until you enable it." />
  if (a.connectivity === 'offline')
    return (
      <Banner
        status="warning"
        title="The agent is offline"
        description="No heartbeat recently. Jobs for its databases wait for it to come back and fail if it does not."
      />
    )
  return null
}
