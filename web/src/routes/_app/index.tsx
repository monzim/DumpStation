import { createFileRoute } from '@tanstack/react-router'
import { format, subDays } from 'date-fns'
import { Grid } from '@astryxdesign/core/Grid'
import { VStack } from '@astryxdesign/core/Layout'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { ErrorState } from '@/components/states'
import { useOverview } from '@/lib/api/hooks'
import { bytes, percent, relativeTime } from '@/lib/format'
import type { Overview } from '@/lib/api/types'
import { MetricTile } from '@/components/overview/MetricTile'
import { BackupHistory } from '@/components/overview/BackupHistory'
import { GettingStarted } from '@/components/overview/GettingStarted'
import {
  ActivePanel,
  ActivityPanel,
  AgentsPanel,
  AttentionPanel,
  RecentFailuresPanel,
  StoragePanel,
  UpcomingPanel,
} from '@/components/overview/sections'
import '@/components/overview/overview.css'

export const Route = createFileRoute('/_app/')({ component: OverviewPage })

function headline(o: Overview): string {
  const parts: string[] = []
  if (o.databases.total === 0) return 'No databases yet.'
  if (o.databases.attention > 0) {
    parts.push(`${o.databases.attention} of ${o.databases.total} database${o.databases.total === 1 ? '' : 's'} need${o.databases.attention === 1 ? 's' : ''} attention`)
  } else {
    parts.push(o.databases.total === 1 ? 'The database is backed up' : `All ${o.databases.total} databases are backed up`)
  }
  parts.push(o.last_success_at ? `last successful backup ${relativeTime(o.last_success_at)}` : 'no successful backup yet')
  return parts.join(' · ') + '.'
}

function OverviewPage() {
  const q = useOverview()

  if (q.isLoading) {
    return (
      <Page width="wide">
        <PageHeader title="Overview" />
        <Grid columns={{ minWidth: 170 }} gap={3}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height={92} index={i} />
          ))}
        </Grid>
        <div className="ds-ov-main">
          <VStack gap={4}>
            <Skeleton height={220} />
            <Skeleton height={200} />
          </VStack>
          <VStack gap={4}>
            <Skeleton height={160} />
            <Skeleton height={200} />
          </VStack>
        </div>
      </Page>
    )
  }

  if (!q.data) {
    return (
      <Page width="wide">
        <PageHeader title="Overview" />
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load the overview" />
      </Page>
    )
  }

  const o = q.data
  const now = new Date()
  const day = format(subDays(now, 1), "yyyy-MM-dd'T'HH:mm:ssxxx")
  const week = format(subDays(now, 6), 'yyyy-MM-dd')

  if (o.databases.total === 0) {
    return (
      <Page width="form">
        <PageHeader title="Overview" description="DumpStation backs up your PostgreSQL databases to object storage on a schedule." />
        <GettingStarted overview={o} />
      </Page>
    )
  }

  const agentsDown = o.agents.offline
  return (
    <Page width="wide">
      <PageHeader title="Overview" description={headline(o)} />
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} title="Showing the last loaded data; refresh failed" /> : null}

      <Grid columns={{ minWidth: 150, repeat: 'fit' }} gap={3}>
        <MetricTile
          label="Protected databases"
          value={`${o.databases.protected}/${o.databases.total}`}
          detail={
            o.databases.unprotected > 0
              ? `${o.databases.unprotected} unprotected`
              : o.databases.paused > 0
                ? `${o.databases.paused} paused`
                : 'All protected'
          }
          href="/databases"
          tone={o.databases.attention > 0 ? 'warn' : undefined}
        />
        <MetricTile
          label="Failed, 24 h"
          value={o.backups.failed_24h}
          detail={`${o.backups.success_24h} succeeded`}
          href={`/backups?status=failed&from=${encodeURIComponent(day)}`}
          tone={o.backups.failed_24h > 0 ? 'alert' : undefined}
        />
        <MetricTile
          label="Success rate, 7 days"
          value={o.backups.success_rate_7d === null ? '—' : percent(o.backups.success_rate_7d)}
          detail={`${o.backups.success_7d + o.backups.failed_7d} finished`}
          href={`/backups?from=${week}`}
        />
        <MetricTile
          label="Running now"
          value={o.backups.active}
          detail={o.backups.active === 0 ? 'Idle' : 'Running or queued'}
          href="/backups?status=pending,running"
        />
        <MetricTile
          label="Agents online"
          value={o.agents.total === 0 ? '—' : `${o.agents.online}/${o.agents.total}`}
          detail={o.agents.total === 0 ? 'No agents' : agentsDown > 0 ? `${agentsDown} offline` : 'All reachable'}
          href="/agents"
          tone={agentsDown > 0 ? 'alert' : undefined}
        />
        <MetricTile
          label="Storage used"
          value={bytes(o.storage.used_bytes)}
          detail={`${o.storage.artifact_count} artifacts`}
          href="/storage"
        />
      </Grid>

      <div className="ds-ov-main">
        <div className="ds-ov-col">
          <AttentionPanel items={o.attention} total={o.databases.total} />
          <BackupHistory daily={o.daily} backups={o.backups} />
          <RecentFailuresPanel items={o.recent_failed} />
        </div>
        <div className="ds-ov-col">
          <ActivePanel items={o.active} />
          <UpcomingPanel items={o.upcoming} />
          <AgentsPanel agents={o.agents} />
          <StoragePanel storage={o.storage} />
          <ActivityPanel items={o.activity} />
        </div>
      </div>
    </Page>
  )
}
