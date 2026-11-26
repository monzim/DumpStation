import { useMemo } from 'react'
import { format, subDays } from 'date-fns'
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { Link } from '@astryxdesign/core/Link'
import { Panel } from '@/components/common'
import { percent } from '@/lib/format'
import type { DailyCount, Overview } from '@/lib/api/types'
import './overview.css'

const DAYS = 14

interface Day {
  key: string
  date: Date
  success: number
  failed: number
}

/** Last 14 days of finished backups as stacked bars, plus 7-day success rate. */
export function BackupHistory({ daily, backups }: { daily: DailyCount[]; backups: Overview['backups'] }) {
  const days = useMemo<Day[]>(() => {
    // The API buckets by calendar day; match on the date part only.
    const byKey = new Map(daily.map((d) => [d.day.slice(0, 10), d]))
    const today = new Date()
    return Array.from({ length: DAYS }, (_, i) => {
      const date = subDays(today, DAYS - 1 - i)
      const key = format(date, 'yyyy-MM-dd')
      const d = byKey.get(key)
      return { key, date, success: d?.success ?? 0, failed: d?.failed ?? 0 }
    })
  }, [daily])

  const max = Math.max(1, ...days.map((d) => d.success + d.failed))
  const totalOk = days.reduce((n, d) => n + d.success, 0)
  const totalFailed = days.reduce((n, d) => n + d.failed, 0)
  const failedDays = days.filter((d) => d.failed > 0)
  const lastFailed = failedDays[failedDays.length - 1]
  const summary =
    totalOk + totalFailed === 0
      ? `No backups finished in the last ${DAYS} days.`
      : `Last ${DAYS} days: ${totalOk} succeeded, ${totalFailed} failed` +
        (lastFailed ? `; most recent failure on ${format(lastFailed.date, 'd MMM')}.` : '.')
  const fromDate = format(subDays(new Date(), 6), 'yyyy-MM-dd')

  return (
    <Panel
      title="Backup history"
      description={`Finished backups per day, last ${DAYS} days`}
      actions={
        <Link href={`/backups?from=${fromDate}`} type="supporting">
          View backups
        </Link>
      }
    >
      <HStack gap={6} wrap="wrap">
        <VStack gap={0.5}>
          <Text type="supporting" color="secondary">
            Success rate, 7 days
          </Text>
          <span className="ds-metric-value">{backups.success_rate_7d === null ? '—' : percent(backups.success_rate_7d)}</span>
        </VStack>
        <VStack gap={0.5}>
          <Text type="supporting" color="secondary">
            Succeeded, 7 days
          </Text>
          <span className="ds-metric-value">{backups.success_7d}</span>
        </VStack>
        <VStack gap={0.5}>
          <Text type="supporting" color="secondary">
            Failed, 7 days
          </Text>
          <span className="ds-metric-value" style={backups.failed_7d > 0 ? { color: 'var(--color-text-error)' } : undefined}>
            {backups.failed_7d}
          </span>
        </VStack>
      </HStack>
      <div>
        <div className="ds-bars" role="img" aria-label={summary}>
          {days.map((d) => {
            const total = d.success + d.failed
            const label = `${format(d.date, 'EEE d MMM')}: ${total === 0 ? 'no backups' : `${d.success} succeeded, ${d.failed} failed`}`
            return (
              <Tooltip key={d.key} content={label}>
                <button type="button" className="ds-ov-bar-hit" aria-label={label}>
                  <span className="ds-bar" style={{ height: `${(total / max) * 100}%`, minHeight: 2 }}>
                    {total === 0 ? (
                      <span className="ds-bar-empty" />
                    ) : (
                      <>
                        {d.success > 0 && <span className="ds-bar-success" style={{ height: `${(d.success / total) * 100}%` }} />}
                        {d.failed > 0 && (
                          <span
                            className="ds-bar-failed"
                            style={{
                              height: `${(d.failed / total) * 100}%`,
                              borderRadius: d.success === 0 ? '2px 2px 0 0' : undefined,
                            }}
                          />
                        )}
                      </>
                    )}
                  </span>
                </button>
              </Tooltip>
            )
          })}
        </div>
        <div className="ds-ov-bars-axis" aria-hidden>
          <Text type="supporting" color="secondary">
            {format(days[0].date, 'd MMM')}
          </Text>
          <Text type="supporting" color="secondary">
            Today
          </Text>
        </div>
      </div>
      <HStack gap={4} vAlign="center" wrap="wrap">
        <HStack gap={1} vAlign="center">
          <span className="ds-ov-dot is-success" aria-hidden />
          <Text type="supporting" color="secondary">
            Succeeded
          </Text>
        </HStack>
        <HStack gap={1} vAlign="center">
          <span className="ds-ov-dot is-error" aria-hidden />
          <Text type="supporting" color="secondary">
            Failed
          </Text>
        </HStack>
        <Text type="supporting" color="secondary">
          {summary}
        </Text>
      </HStack>
    </Panel>
  )
}
