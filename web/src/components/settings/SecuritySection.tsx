import { useEffect, useState, type ReactNode } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { HStack, Layout, LayoutContent, LayoutFooter, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Grid } from '@astryxdesign/core/Grid'
import { Button } from '@astryxdesign/core/Button'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Stepper, Step } from '@astryxdesign/core/Stepper'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Card } from '@astryxdesign/core/Card'
import { ShieldCheck, ShieldOff, KeyRound, Copy, Download, LogOut, Check } from 'lucide-react'
import { Panel, Facts, CopyValue, useNotify } from '@/components/common'
import { BlockSkeleton, ErrorState } from '@/components/states'
import { useMe, useTwoFactorStatus } from '@/lib/api/hooks'
import { session, errorMessage } from '@/lib/api/client'
import { useSession } from '@/lib/auth/session'
import { dateTime, relativeTime } from '@/lib/format'
import type { TwoFactorSetup } from '@/lib/api/types'
import { downloadText, useDisableTwoFactor, useRegenerateBackupCodes, useSetupTwoFactor, useVerifyTwoFactorSetup } from './api'

const CODE_RE = /^\d{8}$/
const LOW_CODES = 3

export function SecuritySection() {
  return (
    <VStack gap={4}>
      <TwoFactorPanel />
      <SessionPanel />
    </VStack>
  )
}

function TwoFactorPanel() {
  const status = useTwoFactorStatus()
  const me = useMe()
  const readOnly = !!me.data?.is_demo
  const [enableOpen, setEnableOpen] = useState(false)
  const [regenOpen, setRegenOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)

  return (
    <Panel
      title="Two-factor authentication"
      description="Ask for an 8-digit code from an authenticator app (Google Authenticator, 1Password, Authy…) every time you sign in."
    >
      {status.isLoading ? (
        <BlockSkeleton height={80} />
      ) : status.error || !status.data ? (
        <ErrorState error={status.error} onRetry={() => status.refetch()} title="Could not load two-factor status" />
      ) : status.data.enabled ? (
        <VStack gap={3}>
          <Facts
            items={[
              { label: 'Status', value: <Badge variant="success" label="Enabled" icon={<ShieldCheck size={13} />} /> },
              { label: 'Enabled on', value: status.data.verified_at ? dateTime(status.data.verified_at) : 'Yes' },
              {
                label: 'Backup codes left',
                value: (
                  <HStack gap={2} vAlign="center">
                    <Text hasTabularNumbers>{status.data.backup_codes_count}</Text>
                    {status.data.backup_codes_count <= LOW_CODES && <Badge variant="warning" label={status.data.backup_codes_count === 0 ? 'None left' : 'Running low'} />}
                  </HStack>
                ),
              },
            ]}
          />
          {status.data.backup_codes_count <= LOW_CODES && (
            <Banner
              status="warning"
              title="Generate new backup codes"
              description="Backup codes let you sign in when your authenticator is unavailable. Each one works once."
            />
          )}
          <HStack gap={2} wrap="wrap">
            <Button label="Regenerate backup codes" icon={<KeyRound size={14} />} onClick={() => setRegenOpen(true)} isDisabled={readOnly} />
            <Button label="Disable two-factor" variant="destructive" icon={<ShieldOff size={14} />} onClick={() => setDisableOpen(true)} isDisabled={readOnly} />
          </HStack>
        </VStack>
      ) : (
        <HStack gap={3} vAlign="center" wrap="wrap">
          <Badge variant="warning" label="Not enabled" icon={<ShieldOff size={13} />} />
          <StackItem size="fill">
            <Text color="secondary">Your account is protected by your sign-in provider only. Adding a second factor stops someone with access to that account from signing in here.</Text>
          </StackItem>
          <Button
            label="Enable two-factor"
            variant="primary"
            icon={<ShieldCheck size={14} />}
            onClick={() => setEnableOpen(true)}
            isDisabled={readOnly}
            tooltip={readOnly ? 'The demo account cannot change two-factor settings' : undefined}
          />
        </HStack>
      )}
      <EnableDialog isOpen={enableOpen} onOpenChange={setEnableOpen} />
      <RegenerateDialog isOpen={regenOpen} onOpenChange={setRegenOpen} />
      <DisableDialog isOpen={disableOpen} onOpenChange={setDisableOpen} />
    </Panel>
  )
}

function CodeInput({ value, onChange, error, label = 'Authenticator code' }: { value: string; onChange: (v: string) => void; error?: string; label?: string }) {
  return (
    <TextInput
      label={label}
      value={value}
      onChange={(v) => onChange(v.replace(/\D/g, '').slice(0, 8))}
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="8-digit code"
      hasAutoFocus
      description="The current code shown in your authenticator app."
      status={error ? { type: 'error', message: error } : undefined}
      controlClassName="ds-mono"
    />
  )
}

function BackupCodesList({ codes, onSaved }: { codes: string[]; onSaved?: () => void }) {
  const [copied, setCopied] = useState(false)
  const text = codes.join('\n')
  return (
    <VStack gap={3}>
      <Card variant="muted" padding={3}>
        <Grid columns={{ minWidth: 140, max: 2 }} gap={2}>
          {codes.map((c) => (
            <Text key={c} className="ds-mono" hasTabularNumbers>
              {c}
            </Text>
          ))}
        </Grid>
      </Card>
      <HStack gap={2} wrap="wrap">
        <Button
          label={copied ? 'Copied' : 'Copy all'}
          icon={copied ? <Check size={14} /> : <Copy size={14} />}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text)
              onSaved?.()
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              /* blocked */
            }
          }}
        />
        <Button
          label="Download .txt"
          icon={<Download size={14} />}
          onClick={() => {
            downloadText(
              'dumpstation-backup-codes.txt',
              `DumpStation two-factor backup codes\nGenerated ${new Date().toISOString()}\nEach code can be used once.\n\n${text}\n`,
            )
            onSaved?.()
          }}
        />
      </HStack>
    </VStack>
  )
}

function DialogFrame({
  isOpen,
  onOpenChange,
  title,
  subtitle,
  children,
  footer,
  purpose = 'form',
  width = 520,
}: {
  isOpen: boolean
  onOpenChange: (o: boolean) => void
  title: string
  subtitle?: string
  children: ReactNode
  footer: ReactNode
  purpose?: 'form' | 'required'
  width?: number
}) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose={purpose} width={width} maxHeight="90dvh">
      <Layout
        height="auto"
        header={<DialogHeader title={title} subtitle={subtitle} onOpenChange={purpose === 'required' ? undefined : onOpenChange} />}
        content={<LayoutContent padding={4}>{children}</LayoutContent>}
        footer={
          <LayoutFooter padding={4}>
            <HStack gap={2} hAlign="end" wrap="wrap">
              {footer}
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}

function EnableDialog({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  const notify = useNotify()
  const setup = useSetupTwoFactor()
  const verify = useVerifyTwoFactorSetup()
  const [step, setStep] = useState(1)
  const [data, setData] = useState<TwoFactorSetup | null>(null)
  const [code, setCode] = useState('')
  const [touched, setTouched] = useState(false)
  const [codes, setCodes] = useState<string[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setStep(1)
    setData(null)
    setCode('')
    setTouched(false)
    setCodes([])
    setSaved(false)
    verify.reset()
    setup.mutate(undefined, { onSuccess: setData })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const submitCode = async () => {
    setTouched(true)
    if (!CODE_RE.test(code)) return
    try {
      const r = await verify.mutateAsync(code)
      setCodes(r.codes)
      setStep(3)
    } catch {
      /* inline */
    }
  }

  const finish = () => {
    notify.success('Two-factor authentication is on')
    onOpenChange(false)
  }

  const codeErr = touched && !CODE_RE.test(code) ? 'Enter the 8 digits from your app' : verify.error ? errorMessage(verify.error) : undefined

  return (
    <DialogFrame
      isOpen={isOpen}
      onOpenChange={(o) => {
        // Once codes are shown, closing means the user acknowledged them.
        if (!o && step === 3) return finish()
        onOpenChange(o)
      }}
      purpose={step === 3 ? 'required' : 'form'}
      title="Enable two-factor authentication"
      footer={
        step === 1 ? (
          <>
            <Button label="Cancel" onClick={() => onOpenChange(false)} />
            <Button label="Next" variant="primary" onClick={() => setStep(2)} isDisabled={!data} />
          </>
        ) : step === 2 ? (
          <>
            <Button label="Back" onClick={() => setStep(1)} />
            <Button label="Verify and enable" variant="primary" type="submit" form="tfa-verify" isLoading={verify.isPending} />
          </>
        ) : (
          <Button label="Done" variant="primary" onClick={finish} isDisabled={!saved} tooltip={saved ? undefined : 'Copy or download the codes first'} />
        )
      }
    >
      <VStack gap={4}>
        <Stepper activeStep={step - 1} density="compact">
          <Step step={0} label="Scan" status={step > 1 ? 'success' : undefined} />
          <Step step={1} label="Verify" status={step > 2 ? 'success' : undefined} />
          <Step step={2} label="Backup codes" />
        </Stepper>
        {step === 1 &&
          (setup.isPending || (!data && !setup.error) ? (
            <HStack gap={2} vAlign="center">
              <Spinner size="sm" />
              <Text color="secondary">Generating a secret…</Text>
            </HStack>
          ) : setup.error ? (
            <Banner
              status="error"
              title="Could not start setup"
              description={errorMessage(setup.error)}
              endContent={<Button label="Retry" size="sm" onClick={() => setup.mutate(undefined, { onSuccess: setData })} />}
            />
          ) : data ? (
            <VStack gap={3}>
              <Text>Scan this QR code with your authenticator app. It must support 8-digit codes.</Text>
              <HStack gap={4} wrap="wrap" vAlign="center">
                <img className="ds-qr" src={data.qr_code_data_url} alt={`QR code for ${data.issuer} (${data.account_name})`} />
                <StackItem size="fill">
                  <VStack gap={2}>
                    <Text type="supporting" color="secondary">
                      Can't scan? Enter this key manually as a time-based (TOTP) account, 8 digits, 30 seconds:
                    </Text>
                    <CopyValue value={data.secret} label="Copy secret" />
                    <Text type="supporting" color="secondary">
                      Account: {data.issuer} · {data.account_name}
                    </Text>
                  </VStack>
                </StackItem>
              </HStack>
              <Text type="supporting" color="secondary">
                The secret expires if you do not finish setup soon. Closing this dialog leaves two-factor disabled.
              </Text>
            </VStack>
          ) : null)}
        {step === 2 && (
          <form
            id="tfa-verify"
            onSubmit={(e) => {
              e.preventDefault()
              void submitCode()
            }}
          >
            <VStack gap={3}>
              <Text>Enter the code your app now shows for DumpStation to confirm it is set up correctly.</Text>
              <CodeInput value={code} onChange={setCode} error={codeErr} />
            </VStack>
          </form>
        )}
        {step === 3 && (
          <VStack gap={3}>
            <Banner status="success" title="Two-factor authentication is enabled" />
            <Text>
              Save these backup codes somewhere safe, such as a password manager. Each code signs you in once if you lose your authenticator. <strong>They are shown only once.</strong>
            </Text>
            <BackupCodesList codes={codes} onSaved={() => setSaved(true)} />
          </VStack>
        )}
      </VStack>
    </DialogFrame>
  )
}

function RegenerateDialog({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  const regen = useRegenerateBackupCodes()
  const [code, setCode] = useState('')
  const [touched, setTouched] = useState(false)
  const [codes, setCodes] = useState<string[] | null>(null)
  useEffect(() => {
    if (!isOpen) return
    setCode('')
    setTouched(false)
    setCodes(null)
    regen.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])
  const err = touched && !CODE_RE.test(code) ? 'Enter the 8 digits from your app' : regen.error ? errorMessage(regen.error) : undefined
  return (
    <DialogFrame
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Regenerate backup codes"
      subtitle={codes ? undefined : 'Your existing backup codes stop working immediately.'}
      footer={
        codes ? (
          <Button label="Done" variant="primary" onClick={() => onOpenChange(false)} />
        ) : (
          <>
            <Button label="Cancel" onClick={() => onOpenChange(false)} />
            <Button label="Generate new codes" variant="primary" type="submit" form="tfa-regen" isLoading={regen.isPending} />
          </>
        )
      }
    >
      {codes ? (
        <VStack gap={3}>
          <Text>
            New backup codes. <strong>They are shown only once</strong>; the previous set no longer works.
          </Text>
          <BackupCodesList codes={codes} />
        </VStack>
      ) : (
        <form
          id="tfa-regen"
          onSubmit={async (e) => {
            e.preventDefault()
            setTouched(true)
            if (!CODE_RE.test(code)) return
            try {
              setCodes((await regen.mutateAsync(code)).codes)
            } catch {
              /* inline */
            }
          }}
        >
          <CodeInput value={code} onChange={setCode} error={err} />
        </form>
      )}
    </DialogFrame>
  )
}

function DisableDialog({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  const notify = useNotify()
  const disable = useDisableTwoFactor()
  const [code, setCode] = useState('')
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (!isOpen) return
    setCode('')
    setTouched(false)
    disable.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])
  const err = touched && !CODE_RE.test(code) ? 'Enter the 8 digits from your app' : disable.error ? errorMessage(disable.error) : undefined
  return (
    <DialogFrame
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Disable two-factor authentication"
      footer={
        <>
          <Button label="Cancel" onClick={() => onOpenChange(false)} />
          <Button label="Disable two-factor" variant="destructive" type="submit" form="tfa-disable" isLoading={disable.isPending} isDisabled={!CODE_RE.test(code)} />
        </>
      }
    >
      <form
        id="tfa-disable"
        onSubmit={async (e) => {
          e.preventDefault()
          setTouched(true)
          if (!CODE_RE.test(code)) return
          try {
            await disable.mutateAsync(code)
            notify.success('Two-factor authentication disabled')
            onOpenChange(false)
          } catch {
            /* inline */
          }
        }}
      >
        <VStack gap={3}>
          <Text>
            Signing in will only require your sign-in provider again, and all backup codes are deleted. Confirm with a current code from your authenticator (backup codes are not
            accepted here).
          </Text>
          <CodeInput value={code} onChange={setCode} error={err} />
        </VStack>
      </form>
    </DialogFrame>
  )
}

function SessionPanel() {
  const { signOut } = useSession()
  const [, force] = useState(0)
  const [signingOut, setSigningOut] = useState(false)
  // Re-render every 30s so relative times stay accurate (the token refreshes while active).
  useEffect(() => {
    const t = window.setInterval(() => force((n) => n + 1), 30_000)
    return () => window.clearInterval(t)
  }, [])
  const tokenExp = session.tokenExpiresAt()
  const sessionExp = session.sessionExpiresAt()
  const fmt = (d: Date | null, empty: string) =>
    d ? (
      <Text>
        {relativeTime(d.toISOString())} <Text color="secondary">({dateTime(d.toISOString())})</Text>
      </Text>
    ) : (
      <Text color="secondary">{empty}</Text>
    )
  return (
    <Panel
      title="Current session"
      description="Access tokens are short-lived and renew automatically while you are active. The session ends at its hard cap or after inactivity, whichever comes first."
    >
      <Facts
        items={[
          { label: 'Access token expires', value: fmt(tokenExp, 'Unknown') },
          { label: 'Session cap', value: fmt(sessionExp, 'Set at the next token refresh') },
        ]}
      />
      <HStack>
        <Button
          label="Sign out"
          icon={<LogOut size={14} />}
          isLoading={signingOut}
          onClick={async () => {
            setSigningOut(true)
            await signOut('manual')
          }}
        />
      </HStack>
    </Panel>
  )
}
