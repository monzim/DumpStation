import type { ReactNode } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { VStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { RouterLink } from '@/components/RouterLink'
import './overview.css'

/** Compact metric that links to the filtered view behind the number. */
export function MetricTile({
  label,
  value,
  detail,
  href,
  tone,
}: {
  label: string
  value: ReactNode
  detail?: ReactNode
  href: string
  tone?: 'alert' | 'warn'
}) {
  return (
    <RouterLink href={href} className="ds-metric-link">
      <Card padding={3} className={`ds-ov-tile${tone ? ` ds-ov-tile-${tone}` : ''}`}>
        <VStack gap={1}>
          <Text type="supporting" color="secondary" maxLines={1}>
            {label}
          </Text>
          <span className="ds-metric-value">{value}</span>
          {detail !== undefined && (
            <Text type="supporting" color="secondary" maxLines={1}>
              {detail}
            </Text>
          )}
        </VStack>
      </Card>
    </RouterLink>
  )
}
