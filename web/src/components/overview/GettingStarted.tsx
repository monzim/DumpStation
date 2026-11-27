import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { Button } from '@astryxdesign/core/Button'
import { Check } from 'lucide-react'
import { Panel } from '@/components/common'
import type { Overview } from '@/lib/api/types'
import './overview.css'

interface Step {
  title: string
  body: string
  done: boolean
  href: string
  action: string
  optional?: boolean
}

/** First-run checklist shown while no databases exist. */
export function GettingStarted({ overview }: { overview: Overview }) {
  const steps: Step[] = [
    {
      title: 'Add a storage destination',
      body: 'Backups are uploaded to S3, Cloudflare R2, MinIO or any S3-compatible bucket.',
      done: overview.storage.destinations > 0,
      href: '/storage',
      action: overview.storage.destinations > 0 ? 'View storage' : 'Add storage',
    },
    {
      title: 'Add a database',
      body: 'Connect a PostgreSQL database, choose a schedule and a retention policy.',
      done: overview.databases.total > 0,
      href: '/databases/new',
      action: 'Add database',
    },
    {
      title: 'Install a backup agent',
      body: 'For databases on private networks: the agent connects out to DumpStation, so no inbound access is needed.',
      done: overview.agents.total > 0,
      href: '/agents',
      action: overview.agents.total > 0 ? 'View agents' : 'Add agent',
      optional: true,
    },
  ]
  const next = steps.findIndex((s) => !s.done && !s.optional)

  return (
    <Panel title="Get started" description="Three steps to your first scheduled backup.">
      <VStack gap={4}>
        {steps.map((s, i) => (
          <div key={s.title} className="ds-ov-step">
            <span className={`ds-ov-step-num${s.done ? ' is-done' : ''}`} aria-hidden>
              {s.done ? <Check size={14} /> : i + 1}
            </span>
            <StackItem size="fill">
              <HStack gap={3} vAlign="center" wrap="wrap">
                <StackItem size="fill" style={{ minWidth: 220 }}>
                  <VStack gap={0.5}>
                    <Text weight="medium">
                      {s.title}
                      {s.optional ? ' (optional)' : ''}
                      {s.done ? ' — done' : ''}
                    </Text>
                    <Text type="supporting" color="secondary">
                      {s.body}
                    </Text>
                  </VStack>
                </StackItem>
                <Button
                  label={s.action}
                  href={s.href}
                  size="sm"
                  variant={i === next ? 'primary' : 'secondary'}
                />
              </HStack>
            </StackItem>
          </div>
        ))}
      </VStack>
    </Panel>
  )
}
