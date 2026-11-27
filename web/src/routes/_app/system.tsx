import { createFileRoute } from '@tanstack/react-router'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { CopyValue, Facts, Panel } from '@/components/common'
import { ErrorState } from '@/components/states'
import { useAgents, useSystemHealth } from '@/lib/api/hooks'
import { dateTimeSeconds } from '@/lib/format'
import type { Agent, SystemHealth } from '@/lib/api/types'

export const Route = createFileRoute('/_app/system')({ component: SystemPage })

/** Agents dial home to public_url, so it has to be reachable from their networks. */
function publicUrlProblem(url: string): string | null {
  if (!url) return 'No public URL is configured. Agents need it to reach this server.'
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return `"${url}" is not a valid URL.`
  }
  const host = u.hostname
  if (host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host === '0.0.0.0') {
    return 'The public URL points to this machine. Agents on other hosts cannot reach it; set PUBLIC_URL to an address they can resolve.'
  }
  if (u.protocol === 'http:') {
    return 'The public URL uses plain HTTP. Agent credentials and database passwords for central-credential jobs travel over it; serve DumpStation over HTTPS.'
  }
  return null
}

function YesNo({ ok, yes = 'Enabled', no = 'Disabled' }: { ok: boolean; yes?: string; no?: string }) {
  return <Badge variant={ok ? 'success' : 'neutral'} label={ok ? yes : no} />
}

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <HStack gap={1.5} vAlign="center">
      {ok ? (
        <CheckCircle2 size={16} aria-hidden style={{ color: 'var(--color-text-success)' }} />
      ) : (
        <XCircle size={16} aria-hidden style={{ color: 'var(--color-text-error)' }} />
      )}
      <Text>{label}</Text>
    </HStack>
  )
}

function fleet(agents: Agent[]) {
  const c = { online: 0, offline: 0, never: 0, pending: 0, disabled: 0, revoked: 0, running: 0 }
  for (const a of agents) {
    if (a.status === 'pending') c.pending++
    else if (a.status === 'disabled') c.disabled++
    else if (a.status === 'revoked') c.revoked++
    else if (a.connectivity === 'online') c.online++
    else if (a.connectivity === 'never_connected') c.never++
    else c.offline++
    c.running += a.running_jobs
  }
  return c
}

function AgentFleet() {
  const q = useAgents()
  return (
    <Panel
      title="Agent fleet"
      actions={
        <Link href="/agents" type="supporting">
          Manage agents
        </Link>
      }
    >
      {q.isLoading ? (
        <Skeleton height={96} />
      ) : !q.data ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load agents" />
      ) : q.data.length === 0 ? (
        <Text color="secondary">
          No agents registered. <Link href="/agents">Add an agent</Link> to back up databases on private networks.
        </Text>
      ) : (
        (() => {
          const c = fleet(q.data)
          const offline = q.data.filter((a) => a.status === 'active' && a.connectivity !== 'online')
          return (
            <VStack gap={3}>
              <Facts
                items={[
                  { label: 'Online', value: String(c.online) },
                  { label: 'Offline', value: String(c.offline + c.never) },
                  { label: 'Awaiting enrollment', value: String(c.pending) },
                  { label: 'Disabled', value: String(c.disabled) },
                  ...(c.revoked ? [{ label: 'Revoked', value: String(c.revoked) }] : []),
                  { label: 'Jobs running on agents', value: String(c.running) },
                ]}
              />
              {offline.length > 0 && (
                <VStack gap={1}>
                  <Text type="supporting" color="secondary">
                    Not connected
                  </Text>
                  {offline.map((a) => (
                    <HStack key={a.id} gap={2} vAlign="center">
                      <StackItem size="fill">
                        <Link href={`/agents/${a.id}`}>{a.name}</Link>
                      </StackItem>
                      <Badge
                        variant={a.connectivity === 'never_connected' ? 'warning' : 'error'}
                        label={a.connectivity === 'never_connected' ? 'Never connected' : 'Offline'}
                      />
                    </HStack>
                  ))}
                </VStack>
              )}
            </VStack>
          )
        })()
      )}
    </Panel>
  )
}

function HealthBody({ h }: { h: SystemHealth }) {
  const urlProblem = publicUrlProblem(h.public_url)
  const tz = h.timezone === 'Local' ? 'Server local time (TZ not set)' : h.timezone
  return (
    <>
      {!h.database_ok && (
        <Banner status="error" title="Metadata database unreachable" description="DumpStation cannot reach its own PostgreSQL database. Backups and schedules will not run." collapsible={false} />
      )}
      {urlProblem && (
        <Banner status="warning" title="Public URL may not work for agents" description={urlProblem} collapsible={false} />
      )}
      <Grid columns={{ minWidth: 340, max: 2 }} gap={4}>
        <Panel title="Server">
          <Facts
            items={[
              { label: 'Version', value: <span className="ds-mono">{h.version}</span> },
              { label: 'Uptime', value: h.uptime },
              { label: 'Server time', value: dateTimeSeconds(h.server_time) },
              { label: 'Time zone', value: tz },
              {
                label: 'PostgreSQL clients',
                value:
                  h.pg_client_versions.length === 0 ? (
                    <Text color="secondary">None installed — direct backups cannot run</Text>
                  ) : (
                    <HStack gap={1} wrap="wrap">
                      {h.pg_client_versions.map((v) => (
                        <Badge key={v} label={`v${v}`} />
                      ))}
                    </HStack>
                  ),
              },
              { label: 'Public URL', value: h.public_url ? <CopyValue value={h.public_url} label="Copy public URL" /> : '—' },
            ]}
          />
        </Panel>
        <Panel title="Metadata database">
          <Facts
            items={[
              { label: 'Status', value: <Status ok={h.database_ok} label={h.database_ok ? 'Reachable' : 'Unreachable'} /> },
              { label: 'Latency', value: h.database_ok ? `${h.database_latency_ms} ms` : '—' },
            ]}
          />
        </Panel>
        <Panel title="Scheduler and jobs">
          <Facts
            items={[
              { label: 'Active schedules', value: <Link href="/schedules">{String(h.scheduler.active_schedules)}</Link> },
              { label: 'Direct concurrency', value: `${h.jobs.direct_concurrency} backup${h.jobs.direct_concurrency === 1 ? '' : 's'} at a time` },
              { label: 'Agent queue TTL', value: <span className="ds-mono">{h.jobs.queue_ttl}</span> },
              { label: 'Agent lease TTL', value: <span className="ds-mono">{h.jobs.lease_ttl}</span> },
              { label: 'Max attempts', value: String(h.jobs.max_attempts) },
            ]}
          />
        </Panel>
        <Panel title="Authentication">
          <Facts
            items={[
              { label: 'GitHub sign-in', value: <YesNo ok={h.auth.github} /> },
              { label: 'Discord sign-in', value: <YesNo ok={h.auth.discord} /> },
              { label: 'Turnstile', value: <YesNo ok={h.auth.turnstile} /> },
              { label: 'Demo access', value: <YesNo ok={h.auth.demo} /> },
              { label: 'Login alerts', value: <YesNo ok={h.notifications.discord_login_webhook} yes="Discord webhook" no="Off" /> },
            ]}
          />
        </Panel>
        <AgentFleet />
      </Grid>
    </>
  )
}

function SystemPage() {
  const q = useSystemHealth()
  return (
    <Page width="wide">
      <PageHeader
        title="System health"
        description="Server status, job settings and agent connectivity. Refreshes every 30 seconds."
      />
      {q.isLoading ? (
        <Grid columns={{ minWidth: 340, max: 2 }} gap={4}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} height={200} index={i} />
          ))}
        </Grid>
      ) : !q.data ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load system health" />
      ) : (
        <HealthBody h={q.data} />
      )}
    </Page>
  )
}
