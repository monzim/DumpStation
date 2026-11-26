import { Grid } from '@astryxdesign/core/Grid'
import { Selector } from '@astryxdesign/core/Selector'
import { DateInput } from '@astryxdesign/core/DateInput'
import { Button } from '@astryxdesign/core/Button'
import { ACTION_GROUPS, actionLabel, ENTITY_TYPES, LEVELS } from './meta'

import type { ComponentProps } from 'react'

type ISODay = ComponentProps<typeof DateInput>['value']
const day = (v?: string) => v as ISODay

export interface ActivityFilterValues {
  level?: string
  action?: string
  entity_type?: string
  from?: string // YYYY-MM-DD
  to?: string // YYYY-MM-DD
}

const actionOptions = ACTION_GROUPS.map((g) => ({
  type: 'section' as const,
  title: g.title,
  options: g.actions.map((a) => ({ value: a, label: actionLabel(a) })),
}))

export function ActivityFilters({
  value,
  onChange,
}: {
  value: ActivityFilterValues
  onChange: (patch: Partial<ActivityFilterValues>) => void
}) {
  const active = Boolean(value.level || value.action || value.entity_type || value.from || value.to)
  return (
    <Grid columns={{ minWidth: 150 }} gap={2} align="end">
      <Selector
        label="Level"
        size="sm"
        width="100%"
        placeholder="All levels"
        hasClear
        value={value.level ?? null}
        options={LEVELS}
        onChange={(v) => onChange({ level: v ?? undefined })}
      />
      <Selector
        label="Action"
        size="sm"
        width="100%"
        placeholder="All actions"
        hasClear
        hasSearch
        searchPlaceholder="Find an action"
        value={value.action ?? null}
        options={actionOptions}
        onChange={(v) => onChange({ action: v ?? undefined })}
      />
      <Selector
        label="Resource"
        size="sm"
        width="100%"
        placeholder="All resources"
        hasClear
        value={value.entity_type ?? null}
        options={ENTITY_TYPES}
        onChange={(v) => onChange({ entity_type: v ?? undefined })}
      />
      <DateInput
        label="From"
        size="sm"
        width="100%"
        format="date"
        hasClear
        placeholder="Any date"
        value={day(value.from)}
        max={day(value.to)}
        onChange={(v) => v !== value.from && onChange({ from: v })}
      />
      <DateInput
        label="To"
        size="sm"
        width="100%"
        format="date"
        hasClear
        placeholder="Any date"
        value={day(value.to)}
        min={day(value.from)}
        onChange={(v) => v !== value.to && onChange({ to: v })}
      />
      {active && (
        <Button
          label="Clear filters"
          size="sm"
          variant="ghost"
          style={{ justifySelf: 'start' }}
          onClick={() => onChange({ level: undefined, action: undefined, entity_type: undefined, from: undefined, to: undefined })}
        />
      )}
    </Grid>
  )
}
