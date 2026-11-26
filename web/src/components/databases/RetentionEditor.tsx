import { HStack, VStack } from '@astryxdesign/core/Layout'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { Text } from '@astryxdesign/core/Text'
import type { RotationPolicy, RotationPolicyType } from '@/lib/api/types'
import { RETENTION_MAX, explainRetention, validateRetention } from './schedule'

/** Retention policy editor: keep last N backups, or keep backups for N days. */
export function RetentionEditor({
  value,
  onChange,
  isDisabled,
  showErrors = true,
}: {
  value: RotationPolicy
  onChange: (value: RotationPolicy) => void
  isDisabled?: boolean
  showErrors?: boolean
}) {
  const error = showErrors ? validateRetention(value) : undefined
  return (
    <VStack gap={4}>
      <RadioList
        label="Retention policy"
        value={value.type}
        onChange={(t) => onChange({ type: t as RotationPolicyType, value: value.value })}
        isDisabled={isDisabled}
      >
        <RadioListItem value="count" label="Keep a number of backups" description="Keep the most recent N successful backups." />
        <RadioListItem value="days" label="Keep backups for a number of days" description="Keep successful backups younger than N days." />
      </RadioList>
      <HStack gap={3} vAlign="end" wrap="wrap">
        <NumberInput
          label={value.type === 'days' ? 'Days to keep' : 'Backups to keep'}
          units={value.type === 'days' ? 'days' : 'backups'}
          value={value.value}
          min={1}
          max={RETENTION_MAX[value.type]}
          isIntegerOnly
          width={220}
          onChange={(v) => onChange({ type: value.type, value: v })}
          status={error ? { type: 'error', message: error } : undefined}
          isDisabled={isDisabled}
        />
      </HStack>
      {!error && (
        <Text type="supporting" color="secondary">
          {explainRetention(value)}
        </Text>
      )}
    </VStack>
  )
}
