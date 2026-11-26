import { HStack, VStack } from '@astryxdesign/core/Layout'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TextArea } from '@astryxdesign/core/TextArea'
import { Switch } from '@astryxdesign/core/Switch'
import { Token } from '@astryxdesign/core/Token'
import type { Agent, AgentInput } from '@/lib/api/types'

export interface AgentFormState {
  name: string
  description: string
  labels: string
  allowRestore: boolean
}

export const emptyAgentForm: AgentFormState = { name: '', description: '', labels: '', allowRestore: false }

export function agentToForm(a: Agent): AgentFormState {
  return { name: a.name, description: a.description ?? '', labels: (a.labels ?? []).join(', '), allowRestore: a.allow_restore }
}

export function parseLabels(s: string): string[] {
  return [...new Set(s.split(',').map((l) => l.trim()).filter(Boolean))]
}

export function validateAgentForm(f: AgentFormState): Partial<Record<'name' | 'description' | 'labels', string>> {
  const e: Partial<Record<'name' | 'description' | 'labels', string>> = {}
  if (!f.name.trim()) e.name = 'Name is required'
  else if (f.name.trim().length > 100) e.name = 'Use at most 100 characters'
  if (f.description.length > 1000) e.description = 'Use at most 1000 characters'
  const labels = parseLabels(f.labels)
  if (labels.length > 20) e.labels = 'Use at most 20 labels'
  else if (labels.some((l) => l.length > 40)) e.labels = 'Each label can have at most 40 characters'
  return e
}

export function formToInput(f: AgentFormState): AgentInput {
  return { name: f.name.trim(), description: f.description.trim(), labels: parseLabels(f.labels), allow_restore: f.allowRestore }
}

/** Name, description, labels and restore permission for an agent. */
export function AgentFields({
  value,
  onChange,
  errors,
  serverErrors,
  agentAllowsRestore,
}: {
  value: AgentFormState
  onChange: (v: AgentFormState) => void
  errors: ReturnType<typeof validateAgentForm>
  serverErrors?: Record<string, string>
  /** Known agent-side DUMPSTATION_ALLOW_RESTORE value (edit only). */
  agentAllowsRestore?: boolean
}) {
  const set = (patch: Partial<AgentFormState>) => onChange({ ...value, ...patch })
  const err = (k: 'name' | 'description' | 'labels') => {
    const m = errors[k] ?? serverErrors?.[k]
    return m ? { type: 'error' as const, message: m } : undefined
  }
  const labels = parseLabels(value.labels)
  let restoreHint =
    'Off by default. The agent must also be started with DUMPSTATION_ALLOW_RESTORE=true; both sides have to agree before it restores anything.'
  if (agentAllowsRestore === true) restoreHint = 'The agent reports DUMPSTATION_ALLOW_RESTORE=true, so this switch decides.'
  if (agentAllowsRestore === false)
    restoreHint = 'The agent reports DUMPSTATION_ALLOW_RESTORE is not set. Restores stay blocked until it is set to true on the agent.'
  return (
    <VStack gap={4}>
      <TextInput
        label="Name"
        value={value.name}
        onChange={(v) => set({ name: v })}
        isRequired
        placeholder="eu-private-vpc"
        description="Shown wherever this agent runs a job. Use the network or site it lives in."
        status={err('name')}
        autoComplete="off"
      />
      <TextArea
        label="Description"
        value={value.description}
        onChange={(v) => set({ description: v })}
        isOptional
        rows={2}
        placeholder="Runs in the production VPC next to the orders cluster"
        status={err('description')}
      />
      <VStack gap={2}>
        <TextInput
          label="Labels"
          value={value.labels}
          onChange={(v) => set({ labels: v })}
          isOptional
          placeholder="production, eu-west"
          description="Comma separated."
          status={err('labels')}
          autoComplete="off"
        />
        {labels.length > 0 && (
          <HStack gap={1} wrap="wrap">
            {labels.map((l) => (
              <Token key={l} label={l} size="sm" />
            ))}
          </HStack>
        )}
      </VStack>
      <Switch label="Allow restores" value={value.allowRestore} onChange={(v) => set({ allowRestore: v })} description={restoreHint} />
    </VStack>
  )
}
