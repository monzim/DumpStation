import { useEffect, useState, type ReactNode } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from '@astryxdesign/core/Layout'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Switch } from '@astryxdesign/core/Switch'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { Button } from '@astryxdesign/core/Button'
import { Banner } from '@astryxdesign/core/Banner'
import { Text } from '@astryxdesign/core/Text'
import { errorMessage } from '@/lib/api/client'
import { useNotify } from '@/components/common'
import { useCreateServerDatabase, useCreateServerRole, useGrantPreset, useServerRoles, type GrantPreset } from './api'

// PostgreSQL identifiers: keep to the conservative unquoted form so names are
// predictable in psql and connection strings (the server quotes them anyway).
const IDENT = /^[A-Za-z_][A-Za-z0-9_$-]{0,62}$/
const identError = (v: string, what: string) =>
  !v.trim() ? `${what} is required` : !IDENT.test(v.trim()) ? 'Use letters, digits, _ or -, starting with a letter or _ (max 63)' : undefined

function FormDialog({
  isOpen,
  onOpenChange,
  title,
  subtitle,
  submitLabel,
  isLoading,
  onSubmit,
  children,
}: {
  isOpen: boolean
  onOpenChange: (o: boolean) => void
  title: string
  subtitle?: string
  submitLabel: string
  isLoading: boolean
  onSubmit: () => void
  children: ReactNode
}) {
  const formId = `form-${title.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={480}>
      <Layout
        height="auto"
        header={<DialogHeader title={title} subtitle={subtitle} onOpenChange={onOpenChange} />}
        content={
          <LayoutContent padding={4}>
            <form
              id={formId}
              onSubmit={(e) => {
                e.preventDefault()
                onSubmit()
              }}
            >
              <VStack gap={3}>
                {children}
                <button type="submit" hidden aria-hidden tabIndex={-1} />
              </VStack>
            </form>
          </LayoutContent>
        }
        footer={
          <LayoutFooter padding={4}>
            <HStack gap={2} hAlign="end">
              <Button label="Cancel" onClick={() => onOpenChange(false)} />
              <Button label={submitLabel} variant="primary" type="submit" form={formId} isLoading={isLoading} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}

export function CreateDatabaseDialog({ serverId, isOpen, onOpenChange }: { serverId: string; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  const notify = useNotify()
  const create = useCreateServerDatabase(serverId)
  const roles = useServerRoles(serverId, isOpen)
  const [name, setName] = useState('')
  const [owner, setOwner] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (isOpen) {
      setName('')
      setOwner(null)
      setTouched(false)
      create.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])
  const err = identError(name, 'Name')
  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Create database"
      subtitle="Runs CREATE DATABASE on this server."
      submitLabel="Create database"
      isLoading={create.isPending}
      onSubmit={async () => {
        setTouched(true)
        if (err) return
        try {
          await create.mutateAsync({ name: name.trim(), owner: owner || undefined })
          notify.success(`Created database ${name.trim()}`)
          onOpenChange(false)
        } catch {
          /* inline */
        }
      }}
    >
      <TextInput
        label="Database name"
        value={name}
        onChange={setName}
        hasAutoFocus
        isRequired
        autoComplete="off"
        status={touched && err ? { type: 'error', message: err } : undefined}
      />
      <Selector
        label="Owner"
        isOptional
        hasClear
        hasSearch
        value={owner}
        onChange={setOwner}
        placeholder="Connection user (default)"
        isLoading={roles.isLoading}
        options={(roles.data ?? []).map((r) => r.name)}
        emptyText={roles.error ? 'Could not load roles' : 'No roles'}
      />
      {create.error ? <Banner status="error" title="Could not create database" description={errorMessage(create.error)} /> : null}
    </FormDialog>
  )
}

export function CreateRoleDialog({ serverId, isOpen, onOpenChange }: { serverId: string; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  const notify = useNotify()
  const create = useCreateServerRole(serverId)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [canLogin, setCanLogin] = useState(true)
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (isOpen) {
      setUsername('')
      setPassword('')
      setCanLogin(true)
      setTouched(false)
      create.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])
  const userErr = identError(username, 'Role name')
  const passErr = !password ? 'Password is required' : password.length < 8 ? 'Use at least 8 characters' : undefined
  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Create role"
      subtitle="Runs CREATE ROLE on this server. Grant database access afterwards from a database page."
      submitLabel="Create role"
      isLoading={create.isPending}
      onSubmit={async () => {
        setTouched(true)
        if (userErr || passErr) return
        try {
          await create.mutateAsync({ username: username.trim(), password, can_login: canLogin })
          notify.success(`Created role ${username.trim()}`)
          onOpenChange(false)
        } catch {
          /* inline */
        }
      }}
    >
      <TextInput
        label="Role name"
        value={username}
        onChange={setUsername}
        hasAutoFocus
        isRequired
        autoComplete="off"
        status={touched && userErr ? { type: 'error', message: userErr } : undefined}
      />
      <TextInput
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        isRequired
        autoComplete="new-password"
        status={touched && passErr ? { type: 'error', message: passErr } : undefined}
      />
      <Switch label="Can log in" description="Off creates a group role that other roles can inherit from." value={canLogin} onChange={setCanLogin} />
      {create.error ? <Banner status="error" title="Could not create role" description={errorMessage(create.error)} /> : null}
    </FormDialog>
  )
}

const PRESETS: { value: GrantPreset; label: string; description: string }[] = [
  { value: 'readonly', label: 'Read only', description: 'CONNECT, USAGE on schema public, SELECT on all current and future tables.' },
  {
    value: 'readwrite',
    label: 'Read and write',
    description: 'Read only plus INSERT, UPDATE, DELETE on tables and USAGE/UPDATE on sequences (current and future).',
  },
  { value: 'owner', label: 'Owner', description: 'ALTER DATABASE … OWNER TO the role. Full control of the database.' },
]

export function GrantDialog({
  serverId,
  dbname,
  isOpen,
  onOpenChange,
}: {
  serverId: string
  dbname: string
  isOpen: boolean
  onOpenChange: (o: boolean) => void
}) {
  const notify = useNotify()
  const grant = useGrantPreset(serverId, dbname)
  const roles = useServerRoles(serverId, isOpen)
  const [username, setUsername] = useState<string | null>(null)
  const [preset, setPreset] = useState<GrantPreset>('readonly')
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (isOpen) {
      setUsername(null)
      setPreset('readonly')
      setTouched(false)
      grant.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])
  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Grant access to ${dbname}`}
      subtitle="Applies a permission preset to an existing role. Table grants cover the public schema only."
      submitLabel="Grant access"
      isLoading={grant.isPending}
      onSubmit={async () => {
        setTouched(true)
        if (!username) return
        try {
          await grant.mutateAsync({ username, preset })
          notify.success(`Granted ${PRESETS.find((p) => p.value === preset)?.label.toLowerCase()} on ${dbname} to ${username}`)
          onOpenChange(false)
        } catch {
          /* inline */
        }
      }}
    >
      <Selector
        label="Role"
        isRequired
        hasSearch
        value={username ?? undefined}
        onChange={setUsername}
        placeholder="Select a role"
        isLoading={roles.isLoading}
        options={(roles.data ?? []).map((r) => ({ value: r.name, label: r.name, description: r.is_superuser ? 'Superuser' : r.can_login ? 'Login role' : 'Group role' }))}
        emptyText={roles.error ? 'Could not load roles' : 'No roles. Create one on the server page.'}
        status={touched && !username ? { type: 'error', message: 'Choose a role' } : undefined}
      />
      <RadioList label="Permission preset" value={preset} onChange={(v) => setPreset(v as GrantPreset)}>
        {PRESETS.map((p) => (
          <RadioListItem key={p.value} value={p.value} label={p.label} description={p.description} />
        ))}
      </RadioList>
      {preset === 'owner' && (
        <Text type="supporting" color="secondary">
          Ownership moves away from the current owner. Use with care on shared databases.
        </Text>
      )}
      {grant.error ? <Banner status="error" title="Could not grant access" description={errorMessage(grant.error)} /> : null}
    </FormDialog>
  )
}
