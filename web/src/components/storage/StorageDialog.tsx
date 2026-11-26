import { useEffect, useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from '@astryxdesign/core/Layout'
import { Grid } from '@astryxdesign/core/Grid'
import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Switch } from '@astryxdesign/core/Switch'
import { Banner } from '@astryxdesign/core/Banner'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { useSaveStorage, useStorageSettings, useTestStorage } from '@/lib/api/hooks'
import { ApiError, errorMessage } from '@/lib/api/client'
import type { StorageConfig, StorageInput, StorageProvider, StorageTestResult } from '@/lib/api/types'
import { PROVIDER_LABEL } from '@/lib/format'
import { useNotify } from '@/components/common'
import { StorageTestBanner } from './StorageTestResult'

interface FormState {
  name: string
  provider: StorageProvider
  bucket: string
  region: string
  endpoint: string
  accessKey: string
  secretKey: string
  isDefault: boolean
}

const PROVIDERS: StorageProvider[] = ['s3', 'r2', 'minio', 's3_compatible']

const PROVIDER_HELP: Record<StorageProvider, { endpoint: string; endpointHint: string; region: string; regionHint: string }> = {
  s3: {
    endpoint: '',
    endpointHint: 'Leave empty for AWS. Set only for a VPC endpoint or another AWS partition.',
    region: 'us-east-1',
    regionHint: 'The bucket’s AWS region.',
  },
  r2: {
    endpoint: 'https://<account-id>.r2.cloudflarestorage.com',
    endpointHint: 'From the R2 dashboard: S3 API endpoint for your account (without the bucket).',
    region: 'auto',
    regionHint: 'R2 uses "auto".',
  },
  minio: {
    endpoint: 'https://minio.internal:9000',
    endpointHint: 'The MinIO S3 API address, including the port.',
    region: 'us-east-1',
    regionHint: 'Optional. MinIO defaults to us-east-1.',
  },
  s3_compatible: {
    endpoint: 'https://s3.example.com',
    endpointHint: 'The provider’s S3 API endpoint (Backblaze B2, Wasabi, SeaweedFS, Ceph…).',
    region: 'us-east-1',
    regionHint: 'Optional unless the provider requires one.',
  },
}

type Errors = Partial<Record<'name' | 'bucket' | 'endpoint' | 'region' | 'access_key' | 'secret_key', string>>

function validate(f: FormState, isEdit: boolean): Errors {
  const e: Errors = {}
  if (!f.name.trim()) e.name = 'Name is required'
  if (!f.bucket.trim()) e.bucket = 'Bucket is required'
  else if (/\s|\//.test(f.bucket.trim())) e.bucket = 'Use the bucket name only, without slashes or spaces'
  if (f.provider !== 's3' && !f.endpoint.trim()) e.endpoint = 'Endpoint is required for this provider'
  if (f.endpoint.trim()) {
    try {
      const u = new URL(f.endpoint.trim())
      if (u.protocol !== 'http:' && u.protocol !== 'https:') e.endpoint = 'Use an http:// or https:// URL'
    } catch {
      e.endpoint = 'Enter a full URL such as https://s3.example.com'
    }
  }
  if (!isEdit && !f.accessKey.trim()) e.access_key = 'Access key is required'
  if (!isEdit && !f.secretKey) e.secret_key = 'Secret key is required'
  return e
}

function toInput(f: FormState): StorageInput {
  return {
    name: f.name.trim(),
    provider: f.provider,
    bucket: f.bucket.trim(),
    region: f.region.trim() || undefined,
    endpoint: f.endpoint.trim() || undefined,
    access_key: f.accessKey.trim() || undefined,
    secret_key: f.secretKey || undefined,
    is_default: f.isDefault,
  }
}

/** Create (storage undefined) or edit a storage destination. */
export function StorageDialog({ storage, isOpen, onOpenChange }: { storage?: StorageConfig; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={640} maxHeight="90dvh">
      {isOpen && <StorageForm storage={storage} onClose={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function StorageForm({ storage, onClose }: { storage?: StorageConfig; onClose: () => void }) {
  const isEdit = !!storage
  const settings = useStorageSettings(storage?.id ?? '', isEdit)
  const [form, setForm] = useState<FormState>(() => ({
    name: storage?.name ?? '',
    provider: storage?.provider ?? 's3',
    bucket: '',
    region: storage ? '' : 'us-east-1',
    endpoint: '',
    accessKey: '',
    secretKey: '',
    isDefault: storage?.is_default ?? false,
  }))
  const [loaded, setLoaded] = useState(!isEdit)
  const [submitted, setSubmitted] = useState(false)
  const [testResult, setTestResult] = useState<StorageTestResult | null>(null)
  const save = useSaveStorage(storage?.id)
  const test = useTestStorage()
  const notify = useNotify()

  useEffect(() => {
    if (settings.data && !loaded) {
      setForm((f) => ({ ...f, bucket: settings.data.bucket, region: settings.data.region, endpoint: settings.data.endpoint }))
      setLoaded(true)
    }
  }, [settings.data, loaded])

  const set = (patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }))
    setTestResult(null)
  }
  const changeProvider = (p: StorageProvider) => {
    const prevDefault = PROVIDER_HELP[form.provider].region
    // Swap the region default when the user hasn't typed their own.
    const region = !form.region || form.region === prevDefault ? PROVIDER_HELP[p].region : form.region
    set({ provider: p, region })
  }

  const errors = submitted ? validate(form, isEdit) : {}
  const serverFieldErrors = save.error instanceof ApiError ? save.error.fieldErrors : {}
  const status = (k: keyof Errors) => {
    const m = errors[k] ?? serverFieldErrors[k]
    return m ? { type: 'error' as const, message: m } : undefined
  }
  const help = PROVIDER_HELP[form.provider]
  const regionWarning =
    form.provider === 's3' && !form.region.trim() ? { type: 'warning' as const, message: 'AWS needs the bucket’s region; requests may be redirected without it.' } : undefined

  const runTest = () => {
    setSubmitted(true)
    const errs = validate(form, isEdit)
    if (Object.keys(errs).length > 0) return
    setTestResult(null)
    test.mutate({ input: { ...toInput(form), id: storage?.id } }, { onSuccess: setTestResult })
  }
  const submit = () => {
    setSubmitted(true)
    if (Object.keys(validate(form, isEdit)).length > 0) return
    save.mutate(toInput(form), {
      onSuccess: (s) => {
        notify.success(isEdit ? `Storage ${s.name} updated` : `Storage ${s.name} created`)
        onClose()
      },
    })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Layout
        height="auto"
        header={<DialogHeader title={isEdit ? `Edit ${storage!.name}` : 'Add storage'} subtitle="S3-compatible object storage for backup files" onOpenChange={() => onClose()} />}
        content={
          <LayoutContent padding={4}>
            {!loaded ? (
              settings.error ? (
                <Banner status="error" title="Could not load the storage settings" description={errorMessage(settings.error)} />
              ) : (
                <VStack gap={3}>
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} height={56} index={i} />
                  ))}
                </VStack>
              )
            ) : (
              <VStack gap={4}>
                <Grid columns={{ minWidth: 220, max: 2 }} gap={4}>
                  <TextInput label="Name" value={form.name} onChange={(v) => set({ name: v })} isRequired status={status('name')} placeholder="Primary backups" autoComplete="off" />
                  <Selector
                    label="Provider"
                    options={PROVIDERS.map((p) => ({ value: p, label: PROVIDER_LABEL[p] }))}
                    value={form.provider}
                    onChange={(v) => v && changeProvider(v as StorageProvider)}
                  />
                </Grid>
                <TextInput
                  label="Endpoint"
                  value={form.endpoint}
                  onChange={(v) => set({ endpoint: v })}
                  isRequired={form.provider !== 's3'}
                  isOptional={form.provider === 's3'}
                  placeholder={help.endpoint || 'https://s3.amazonaws.com'}
                  description={help.endpointHint}
                  status={status('endpoint')}
                  type="url"
                  autoComplete="off"
                />
                <Grid columns={{ minWidth: 220, max: 2 }} gap={4}>
                  <TextInput label="Bucket" value={form.bucket} onChange={(v) => set({ bucket: v })} isRequired status={status('bucket')} placeholder="db-backups" autoComplete="off" />
                  <TextInput
                    label="Region"
                    value={form.region}
                    onChange={(v) => set({ region: v })}
                    isOptional={form.provider !== 's3'}
                    placeholder={help.region}
                    description={help.regionHint}
                    status={status('region') ?? regionWarning}
                    autoComplete="off"
                  />
                </Grid>
                <Grid columns={{ minWidth: 220, max: 2 }} gap={4}>
                  <TextInput
                    label="Access key"
                    value={form.accessKey}
                    onChange={(v) => set({ accessKey: v })}
                    isRequired={!isEdit}
                    placeholder={isEdit ? `Stored (${storage!.access_key})` : ''}
                    description={isEdit ? 'Leave blank to keep the stored key.' : undefined}
                    status={status('access_key')}
                    autoComplete="off"
                  />
                  <TextInput
                    label="Secret key"
                    type="password"
                    value={form.secretKey}
                    onChange={(v) => set({ secretKey: v })}
                    isRequired={!isEdit}
                    placeholder={isEdit ? 'Stored' : ''}
                    description={isEdit ? 'Leave blank to keep the stored secret.' : 'Encrypted at rest; never shown again.'}
                    status={status('secret_key')}
                    autoComplete="new-password"
                  />
                </Grid>
                <Switch
                  label="Default storage for new databases"
                  value={form.isDefault}
                  onChange={(v) => set({ isDefault: v })}
                  isDisabled={isEdit && storage!.is_default}
                  description={isEdit && storage!.is_default ? 'This is the default. Make another storage the default to change it.' : undefined}
                />
                {testResult && <StorageTestBanner result={testResult} />}
                {test.error ? <Banner status="error" title="Test request failed" description={errorMessage(test.error)} /> : null}
                {save.error ? <Banner status="error" title={isEdit ? 'Could not save changes' : 'Could not create storage'} description={errorMessage(save.error)} /> : null}
              </VStack>
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter padding={4}>
            <HStack gap={2} hAlign="between" wrap="wrap">
              <Button label="Test before saving" onClick={runTest} isLoading={test.isPending} isDisabled={!loaded} />
              <HStack gap={2}>
                <Button label="Cancel" onClick={onClose} />
                <Button label={isEdit ? 'Save changes' : 'Add storage'} variant="primary" type="submit" isLoading={save.isPending} isDisabled={!loaded} />
              </HStack>
            </HStack>
          </LayoutFooter>
        }
      />
    </form>
  )
}
