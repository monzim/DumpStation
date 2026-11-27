import { HStack } from '@astryxdesign/core/Layout'
import { Banner } from '@astryxdesign/core/Banner'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import type { StorageTestResult } from '@/lib/api/types'

export function stageLabel(stage?: string): string {
  if (!stage) return ''
  return stage.replace(/_/g, ' ')
}

export function StorageTestBanner({ result }: { result: StorageTestResult }) {
  return (
    <Banner
      status={result.ok ? 'success' : 'error'}
      title={result.ok ? `Storage reachable (${result.latency_ms} ms)` : `Check failed${result.stage ? ` at ${stageLabel(result.stage)}` : ''}`}
      description={result.message}
    />
  )
}

/** Compact one-line test outcome for table cells. */
export function StorageTestInline({ result, at }: { result: StorageTestResult; at: Date }) {
  const text = result.ok ? `OK · ${result.latency_ms} ms` : `Failed${result.stage ? ` at ${stageLabel(result.stage)}` : ''}`
  return (
    <Tooltip content={`${result.message} (tested ${at.toLocaleTimeString()})`}>
      <HStack gap={1} vAlign="center">
        <StatusDot variant={result.ok ? 'success' : 'error'} label={result.ok ? 'Reachable' : 'Failed'} />
        <Text type="supporting" color={result.ok ? undefined : 'secondary'} className="ds-nowrap">
          {text}
        </Text>
      </HStack>
    </Tooltip>
  )
}
