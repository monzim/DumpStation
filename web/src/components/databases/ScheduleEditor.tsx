import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TimeInput } from '@astryxdesign/core/TimeInput'
import { useSchedulePreview, useSystemHealth } from '@/lib/api/hooks'
import { relativeTime } from '@/lib/format'
import {
  SCHEDULE_KIND_OPTIONS,
  WEEKDAYS,
  buildCron,
  describeSchedule,
  formatInZone,
  parseCron,
  realZone,
  timeZones,
  type ScheduleKind,
  type ScheduleModel,
} from './schedule'

const SERVER_TZ = '__server__'

export interface ScheduleValue {
  cron: string
  /** IANA zone; '' = the server's zone. */
  timezone: string
}

/** Server-side validity of a schedule (shares the preview query with the editor). */
export function useScheduleCheck(cron: string, timezone: string) {
  const q = useSchedulePreview(cron, timezone)
  const stale = q.isPlaceholderData || q.isFetching
  return {
    isChecking: q.isLoading || (stale && !q.data),
    valid: !!cron.trim() && !!q.data?.valid && !q.isPlaceholderData,
    error: !cron.trim() ? 'Enter a schedule.' : q.data && !q.data.valid && !q.isPlaceholderData ? q.data.error || 'Invalid schedule' : undefined,
  }
}

/**
 * Schedule editor: presets (hourly, every N hours, daily, weekly, monthly,
 * custom cron), a time zone picker, a plain-language description and the
 * next five run times computed by the server.
 */
export function ScheduleEditor({
  value,
  onChange,
  error,
  isDisabled,
  allowServerZone = true,
}: {
  value: ScheduleValue
  onChange: (value: ScheduleValue) => void
  /** External validation message (e.g. from a failed save). */
  error?: string
  isDisabled?: boolean
  /** Offer "Server time zone" (stored as ''); existing schedules may use it. */
  allowServerZone?: boolean
}) {
  const [model, setModel] = useState<ScheduleModel>(() => parseCron(value.cron))
  const lastEmitted = useRef(value.cron)

  // Re-sync when the parent replaces the cron (reset, load).
  useEffect(() => {
    if (value.cron !== lastEmitted.current && value.cron !== buildCron(model)) {
      setModel(parseCron(value.cron))
      lastEmitted.current = value.cron
    }
  }, [value.cron, model])

  const update = (patch: Partial<ScheduleModel>) => {
    const next = { ...model, ...patch }
    if (patch.kind === 'custom' && model.kind !== 'custom') next.cron = buildCron(model)
    setModel(next)
    const cron = buildCron(next)
    lastEmitted.current = cron
    onChange({ cron, timezone: value.timezone })
  }

  const health = useSystemHealth()
  const serverZone = realZone(health.data?.timezone)
  const tzOptions = useMemo(() => {
    const zones = timeZones().map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))
    if (value.timezone && !zones.some((z) => z.value === value.timezone)) zones.unshift({ value: value.timezone, label: value.timezone })
    if (allowServerZone || !value.timezone)
      return [{ value: SERVER_TZ, label: serverZone ? `Server time zone (${serverZone})` : 'Server time zone' }, { type: 'divider' as const }, ...zones]
    return zones
  }, [allowServerZone, serverZone, value.timezone])

  const cron = buildCron(model)
  const preview = useSchedulePreview(cron, value.timezone)
  const effectiveZone = value.timezone || serverZone
  const previewError = cron.trim() ? (preview.data && !preview.data.valid ? preview.data.error || 'Invalid schedule' : undefined) : 'Enter a cron expression.'
  const fieldError = error ?? (model.kind === 'custom' ? previewError : undefined)

  const kindSelector = (
    <Selector
      label="Frequency"
      options={SCHEDULE_KIND_OPTIONS}
      value={model.kind}
      onChange={(v) => v && update({ kind: v as ScheduleKind })}
      isDisabled={isDisabled}
    />
  )

  const time = (
    <TimeInput
      label="Time"
      value={model.time as ComponentProps<typeof TimeInput>["value"]}
      hourFormat="24h"
      presentation="text-input"
      onChange={(v) => v && update({ time: v.slice(0, 5) })}
      isDisabled={isDisabled}
    />
  )

  return (
    <VStack gap={4}>
      <Grid columns={{ minWidth: 200, max: 3 }} gap={3}>
        {kindSelector}
        {model.kind === 'hourly' && (
          <NumberInput
            label="Minute past the hour"
            value={model.minute}
            min={0}
            max={59}
            isIntegerOnly
            onChange={(v) => update({ minute: v })}
            isDisabled={isDisabled}
          />
        )}
        {model.kind === 'every_n_hours' && (
          <>
            <NumberInput
              label="Every"
              units="hours"
              value={model.everyHours}
              min={1}
              max={23}
              isIntegerOnly
              onChange={(v) => update({ everyHours: v })}
              isDisabled={isDisabled}
            />
            <NumberInput
              label="Minute past the hour"
              value={model.minute}
              min={0}
              max={59}
              isIntegerOnly
              onChange={(v) => update({ minute: v })}
              isDisabled={isDisabled}
            />
          </>
        )}
        {model.kind === 'daily' && time}
        {model.kind === 'weekly' && (
          <>
            <Selector
              label="Day"
              options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))}
              value={String(model.weekday)}
              onChange={(v) => v !== null && update({ weekday: Number(v) })}
              isDisabled={isDisabled}
            />
            {time}
          </>
        )}
        {model.kind === 'monthly' && (
          <>
            <NumberInput
              label="Day of month"
              value={model.monthday}
              min={1}
              max={31}
              isIntegerOnly
              description={model.monthday > 28 ? 'Months without this day are skipped.' : undefined}
              onChange={(v) => update({ monthday: v })}
              isDisabled={isDisabled}
            />
            {time}
          </>
        )}
      </Grid>
      {model.kind === 'custom' && (
        <TextInput
          label="Cron expression"
          value={model.cron}
          onChange={(v) => update({ cron: v })}
          placeholder="0 2 * * *"
          description="Five fields: minute, hour, day of month, month, day of week. Descriptors like @daily also work."
          controlClassName="ds-mono"
          status={fieldError ? { type: 'error', message: fieldError } : undefined}
          isDisabled={isDisabled}
          autoComplete="off"
        />
      )}
      {model.kind !== 'custom' && error && (
        <Text type="supporting" color="secondary" role="alert">
          {error}
        </Text>
      )}
      <Selector
        label="Time zone"
        options={tzOptions}
        value={value.timezone || SERVER_TZ}
        hasSearch
        searchPlaceholder="Search time zones"
        description="Schedule times are interpreted in this zone, including daylight saving changes."
        onChange={(v) => v && onChange({ cron, timezone: v === SERVER_TZ ? '' : v })}
        isDisabled={isDisabled}
      />
      <VStack gap={1.5}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text weight="medium">{previewError ? 'Schedule is not valid' : describeSchedule(cron)}</Text>
          <Text type="supporting" color="secondary" className="ds-mono">
            {cron || '—'}
          </Text>
          {preview.isFetching && <Spinner size="sm" />}
        </HStack>
        {previewError ? (
          <Text type="supporting" color="secondary">
            {previewError}
          </Text>
        ) : preview.data?.next?.length ? (
          <VStack gap={0.5}>
            <Text type="supporting" color="secondary">
              Next runs{effectiveZone ? ` (${effectiveZone})` : ''}
            </Text>
            {preview.data.next.map((t) => (
              <HStack key={t} gap={2}>
                <Text type="supporting" hasTabularNumbers>
                  {formatInZone(t, effectiveZone)}
                </Text>
                <Text type="supporting" color="secondary">
                  {relativeTime(t)}
                </Text>
              </HStack>
            ))}
          </VStack>
        ) : null}
      </VStack>
    </VStack>
  )
}
