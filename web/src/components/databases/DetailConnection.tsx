import { useEffect, useMemo, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Divider } from '@astryxdesign/core/Divider'
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Selector } from '@astryxdesign/core/Selector'
import { Heading, Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useNotify } from '@/components/common'
import { BlockSkeleton } from '@/components/states'
import { useDatabaseConnection, useSaveDatabase } from '@/lib/api/hooks'
import type { Database } from '@/lib/api/types'
import { errorMessage } from '@/lib/api/client'
import { AgentPicker, ConnectionFields, ConnectionTest, ExecutionModePicker } from './ConnectionForm'
import {
  connectionFromDatabase,
  connectionInput,
  databaseInputFrom,
  needsConnectionView,
  validateConnection,
  type ConnectionState,
  type ConnectionView,
} from './connection'

const PG_VERSIONS = [
  { value: 'latest', label: 'Auto-detect (recommended)' },
  ...['17', '16', '15', '14', '13', '12'].map((v) => ({ value: v, label: `PostgreSQL ${v}` })),
]

/** Connection tab: loads the unmasked connection, then renders the edit form. */
export function DetailConnection({
  db,
  onDirtyChange,
  isDisabled,
}: {
  db: Database
  onDirtyChange: (dirty: boolean) => void
  isDisabled?: boolean
}) {
  const needConn = needsConnectionView(db)
  const conn = useDatabaseConnection(db.id, needConn && !isDisabled)
  if (needConn && !isDisabled) {
    if (conn.isLoading) return <BlockSkeleton height={360} />
    if (conn.error) return <Banner status="error" title="Could not load connection details" description={errorMessage(conn.error)} />
  }
  return <ConnectionEditor key={db.updated_at} db={db} view={conn.data} onDirtyChange={onDirtyChange} isDisabled={isDisabled} />
}

function ConnectionEditor({
  db,
  view,
  onDirtyChange,
  isDisabled,
}: {
  db: Database
  view?: ConnectionView
  onDirtyChange: (dirty: boolean) => void
  isDisabled?: boolean
}) {
  const save = useSaveDatabase(db.id)
  const notify = useNotify()
  const initial = useMemo(() => connectionFromDatabase(db, view), [db, view])
  const [state, setState] = useState<ConnectionState>(initial)
  const [name, setName] = useState(db.name)
  const [pgVersion, setPgVersion] = useState(db.postgres_version || 'latest')
  const [attempted, setAttempted] = useState(false)

  const dirty = JSON.stringify(state) !== JSON.stringify(initial) || name !== db.name || pgVersion !== (db.postgres_version || 'latest')
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  // The stored password only applies to the same kind of central credentials.
  // It is only reused for the same server: changing host/port/database/user requires re-entering it.
  const targetChanged =
    state.host.trim() !== initial.host || state.port !== initial.port || state.dbname.trim() !== initial.dbname || state.user.trim() !== initial.user
  const hadPassword = !!view?.has_password && !(state.mode === 'agent' && state.credSource === 'agent')
  const passwordStored = hadPassword && !targetChanged
  const errors = validateConnection(state, { passwordStored })
  const nameError = !name.trim() ? 'Enter a name.' : undefined
  const valid = Object.keys(errors).length === 0 && !nameError
  const patch = (p: Partial<ConnectionState>) => setState((s) => ({ ...s, ...p }))
  const switched = state.mode !== initial.mode || state.agentId !== initial.agentId || state.credSource !== initial.credSource

  const submit = async () => {
    setAttempted(true)
    if (!valid) return
    try {
      await save.mutateAsync(databaseInputFrom(db, view, { name: name.trim(), ...connectionInput(state), postgres_version: pgVersion }))
      notify.success('Connection saved')
      onDirtyChange(false)
    } catch {
      /* banner below */
    }
  }

  const shownErrors = attempted ? errors : {}
  return (
    <VStack gap={5} maxWidth={880}>
      <VStack gap={3}>
        <Heading level={3}>General</Heading>
        <TextInput
          label="Name"
          value={name}
          onChange={setName}
          status={attempted && nameError ? { type: 'error', message: nameError } : undefined}
          isDisabled={isDisabled}
        />
      </VStack>
      <Divider />
      <VStack gap={3}>
        <Heading level={3}>Execution method</Heading>
        <ExecutionModePicker value={state.mode} onChange={(mode) => patch({ mode })} isDisabled={isDisabled} />
        {state.mode === 'agent' && <AgentPicker value={state.agentId} onChange={(agentId) => patch({ agentId })} error={shownErrors.agentId} isDisabled={isDisabled} />}
        {switched && (
          <Banner
            status="info"
            title="Execution changes apply to the next backup"
            description="Running backups finish with the old settings. Test the new connection before saving."
          />
        )}
      </VStack>
      <Divider />
      <VStack gap={3}>
        <Heading level={3}>Connection details</Heading>
        {isDisabled ? (
          <Text color="secondary">Connection details are hidden for demo accounts.</Text>
        ) : (
          <ConnectionFields
            value={state}
            onChange={patch}
            errors={shownErrors}
            passwordStored={passwordStored}
            passwordNote={hadPassword && targetChanged ? 'Re-enter the password: it is only reused for the same server.' : undefined}
          />
        )}
        <Selector
          label="PostgreSQL version"
          options={PG_VERSIONS}
          value={pgVersion}
          onChange={(v) => v && setPgVersion(v)}
          description="Which pg_dump major version to use."
          isDisabled={isDisabled}
        />
      </VStack>
      {!isDisabled && (
        <VStack gap={2}>
          <Text type="supporting" color="secondary">
            {!dirty ? 'Tests the saved connection.' : passwordStored ? 'Tests the details in the form (the stored password is used if you left it empty).' : 'Tests the details in the form.'}
          </Text>
          <ConnectionTest value={state} databaseId={db.id} canTest={Object.keys(errors).length === 0} />
          {hadPassword && targetChanged && !state.password && (
            <Text type="supporting" color="secondary">Enter the password to test the changed server.</Text>
          )}
        </VStack>
      )}
      {save.error ? <Banner status="error" title="Could not save" description={errorMessage(save.error)} /> : null}
      <HStack gap={2} hAlign="end">
        <Button
          label="Discard changes"
          onClick={() => {
            setState(initial)
            setName(db.name)
            setPgVersion(db.postgres_version || 'latest')
            setAttempted(false)
            save.reset()
          }}
          isDisabled={!dirty || save.isPending}
        />
        <Button label="Save connection" variant="primary" onClick={submit} isLoading={save.isPending} isDisabled={!dirty || isDisabled} />
      </HStack>
    </VStack>
  )
}
