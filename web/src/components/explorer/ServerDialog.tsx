import { useEffect, useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { HStack, Layout, LayoutContent, LayoutFooter, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Grid } from '@astryxdesign/core/Grid'
import { TextInput } from '@astryxdesign/core/TextInput'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Button } from '@astryxdesign/core/Button'
import { Banner } from '@astryxdesign/core/Banner'
import { Text } from '@astryxdesign/core/Text'
import { ApiError, errorMessage } from '@/lib/api/client'
import { useNotify } from '@/components/common'
import {
  SSL_OPTIONS,
  formatLatency,
  isMasked,
  useSaveServer,
  useTestServerInput,
  useServerConnectionForEdit,
  type ServerConnection,
  type ServerConnectionInput,
  type ServerTestResult,
  type SslMode,
} from './api'

const EMPTY: ServerConnectionInput = { name: '', host: '', port: 5432, user: '', password: '', ssl_mode: 'prefer' }

/**
 * Add or edit a PostgreSQL admin connection. The API masks host and user in
 * responses, so on edit those fields start empty and must be re-entered
 * (sending the masked value back would overwrite the real one).
 */
export function ServerDialog({
  isOpen,
  onOpenChange,
  server,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  server?: ServerConnection
}) {
  const notify = useNotify()
  const save = useSaveServer(server?.id)
  const test = useTestServerInput()
  const [form, setForm] = useState<ServerConnectionInput>(EMPTY)
  const [touched, setTouched] = useState(false)
  const [testResult, setTestResult] = useState<ServerTestResult | null>(null)
  const isEdit = !!server
  const editData = useServerConnectionForEdit(isOpen && server ? server.id : undefined)
  const real = editData.data

  useEffect(() => {
    if (!isOpen) return
    setTouched(false)
    setTestResult(null)
    save.reset()
    test.reset()
    setForm(
      server
        ? {
            name: server.name,
            host: real?.host ?? (isMasked(server.host) ? '' : server.host),
            port: real?.port ?? server.port,
            user: real?.user ?? (isMasked(server.user) ? '' : server.user),
            password: '',
            ssl_mode: (SSL_OPTIONS.some((o) => o.value === server.ssl_mode) ? server.ssl_mode : 'prefer') as SslMode,
          }
        : EMPTY,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, server, real])

  const set = <K extends keyof ServerConnectionInput>(k: K, v: ServerConnectionInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setTestResult(null)
  }

  const fieldErrors = save.error instanceof ApiError ? save.error.fieldErrors : {}
  const errors: Partial<Record<keyof ServerConnectionInput, string>> = {
    name: !form.name.trim() ? 'Name is required' : fieldErrors.name,
    host: !form.host.trim() ? 'Host is required' : fieldErrors.host,
    port: !form.port || form.port < 1 || form.port > 65535 ? 'Port must be 1–65535' : fieldErrors.port,
    user: !form.user.trim() ? 'User is required' : fieldErrors.user,
    password: !isEdit && !form.password ? 'Password is required' : fieldErrors.password,
  }
  const valid = !Object.values(errors).some(Boolean)
  const status = (k: keyof ServerConnectionInput) =>
    touched && errors[k] ? { type: 'error' as const, message: errors[k] } : undefined

  const canTest = !!form.host.trim() && !!form.user.trim() && !!form.password && form.port > 0

  const runTest = async () => {
    try {
      setTestResult(await test.mutateAsync({ ...form, host: form.host.trim(), user: form.user.trim() }))
    } catch (e) {
      setTestResult({ ok: false, ssl_mode: '', message: errorMessage(e) })
    }
  }

  const submit = async () => {
    setTouched(true)
    if (!valid) return
    try {
      await save.mutateAsync({ ...form, name: form.name.trim(), host: form.host.trim(), user: form.user.trim() })
      notify.success(isEdit ? `Saved ${form.name.trim()}` : `Added ${form.name.trim()}`)
      onOpenChange(false)
    } catch {
      /* shown inline */
    }
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={560}>
      <Layout
        height="auto"
        header={
          <DialogHeader
            title={isEdit ? `Edit ${server?.name}` : 'Add server connection'}
            subtitle="An administrative login used to inspect databases, roles and tables. The password is encrypted at rest."
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent padding={4}>
            <form
              id="server-form"
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              <VStack gap={3}>
                <TextInput
                  label="Name"
                  value={form.name}
                  onChange={(v) => set('name', v)}
                  placeholder="Primary cluster"
                  isRequired
                  hasAutoFocus
                  status={status('name')}
                />
                {isEdit && (
                  <Banner
                    status="info"
                    title="Leave the password empty to keep the stored one"
                    description="Changing the host, port or user requires entering the password again: a stored password is only reused for the same server."
                  />
                )}
                <Grid columns={{ minWidth: 200, max: 2 }} gap={3}>
                  <TextInput
                    label="Host"
                    value={form.host}
                    onChange={(v) => set('host', v)}
                    placeholder={isEdit ? server?.host : 'db.internal or 10.0.0.5'}
                    isRequired
                    autoComplete="off"
                    status={status('host')}
                  />
                  <NumberInput
                    label="Port"
                    value={form.port}
                    onChange={(v) => set('port', v)}
                    min={1}
                    max={65535}
                    isIntegerOnly
                    isRequired
                    status={status('port')}
                  />
                  <TextInput
                    label="User"
                    value={form.user}
                    onChange={(v) => set('user', v)}
                    placeholder={isEdit ? server?.user : 'postgres'}
                    isRequired
                    autoComplete="off"
                    status={status('user')}
                  />
                  <TextInput
                    label="Password"
                    type="password"
                    value={form.password}
                    onChange={(v) => set('password', v)}
                    isRequired={!isEdit}
                    isOptional={isEdit}
                    placeholder={isEdit ? 'Unchanged' : undefined}
                    autoComplete="new-password"
                    status={status('password')}
                  />
                </Grid>
                <Text type="supporting" color="secondary">
                  Browsing needs read access. Creating databases and roles needs CREATEDB / CREATEROLE (or a superuser).
                </Text>
                <Selector
                  label="SSL mode"
                  value={form.ssl_mode}
                  onChange={(v) => v && set('ssl_mode', v as SslMode)}
                  options={SSL_OPTIONS.map((o) => ({ value: o.value, label: o.label, description: o.description }))}
                />
                {testResult &&
                  (testResult.ok ? (
                    <Banner
                      status="success"
                      title="Connection succeeded"
                      description={`SSL mode ${testResult.ssl_mode || form.ssl_mode}${testResult.latency ? ` · ${formatLatency(testResult.latency)}` : ''}`}
                    />
                  ) : (
                    <Banner status="error" title="Connection failed" description={testResult.message || 'Unknown error'} />
                  ))}
                {save.error ? (
                  <Banner status="error" title={isEdit ? 'Could not save' : 'Could not add server'} description={errorMessage(save.error)} />
                ) : null}
                {/* Allows Enter to submit from any field. */}
                <button type="submit" hidden aria-hidden tabIndex={-1} />
              </VStack>
            </form>
          </LayoutContent>
        }
        footer={
          <LayoutFooter padding={4}>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <StackItem size="fill">
                <Button
                  label="Test connection"
                  onClick={runTest}
                  isLoading={test.isPending}
                  isDisabled={!canTest}
                  tooltip={canTest ? undefined : 'Enter host, user and password to test'}
                />
              </StackItem>
              <Button label="Cancel" onClick={() => onOpenChange(false)} />
              <Button
                label={isEdit ? 'Save changes' : 'Add server'}
                variant="primary"
                type="submit"
                form="server-form"
                isLoading={save.isPending}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
