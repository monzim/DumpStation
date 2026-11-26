// OTP-gated backup download: request a one-time code on the user's
// notification channels, verify it, then open the short-lived presigned URL.
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter, HStack, VStack } from '@astryxdesign/core/Layout'
import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Banner } from '@astryxdesign/core/Banner'
import { Text } from '@astryxdesign/core/Text'
import { Link } from '@astryxdesign/core/Link'
import { Download, ExternalLink } from 'lucide-react'
import { api, ApiError, buildUrl, errorMessage, session } from '@/lib/api/client'
import type { ApiErrorBody, DownloadOTPResponse, DownloadURLResponse } from '@/lib/api/types'
import { bytes, timeOnly } from '@/lib/format'

/**
 * The verify endpoint answers a wrong code with 401, which the shared `api()`
 * client treats as an expired session (and signs the user out). Call it
 * directly so a mistyped code only shows an inline error.
 */
async function verifyCode(backupId: string, otpId: string, code: string): Promise<DownloadURLResponse> {
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' }
  const t = session.token()
  if (t) headers.Authorization = `Bearer ${t}`
  let res: Response
  try {
    res = await fetch(buildUrl(`/backups/${backupId}/download/verify`), {
      method: 'POST',
      headers,
      body: JSON.stringify({ otp_id: otpId, code }),
    })
  } catch {
    throw new ApiError(0, 'Could not reach the DumpStation server')
  }
  const text = await res.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : undefined
  } catch {
    data = { message: text }
  }
  if (!res.ok) {
    const body = (data ?? {}) as ApiErrorBody & Record<string, unknown>
    throw new ApiError(res.status, body.message || res.statusText || 'Verification failed', body)
  }
  return data as DownloadURLResponse
}

const CHANNEL_LABEL: Record<string, string> = { discord: 'Discord', telegram: 'Telegram' }

export function DownloadDialog({
  backup,
  isOpen,
  onOpenChange,
}: {
  backup: { id: string; name: string; size_bytes?: number; dump_format?: string }
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [otp, setOtp] = useState<DownloadOTPResponse | null>(null)
  const [code, setCode] = useState('')
  const [result, setResult] = useState<DownloadURLResponse | null>(null)

  const request = useMutation({
    mutationFn: () => api<DownloadOTPResponse>(`/backups/${backup.id}/download/request-otp`, { method: 'POST' }),
    onSuccess: (r) => {
      setOtp(r)
      setCode('')
    },
  })
  const verify = useMutation({
    mutationFn: () => verifyCode(backup.id, otp!.otp_id, code.trim()),
    onSuccess: (r) => {
      setResult(r)
      window.open(r.download_url, '_blank', 'noopener,noreferrer')
    },
  })

  const close = (o: boolean) => {
    if (!o) {
      setOtp(null)
      setCode('')
      setResult(null)
      request.reset()
      verify.reset()
    }
    onOpenChange(o)
  }

  const requestErr = request.error
  const noChannels = requestErr instanceof ApiError && requestErr.status === 412
  const codeValid = /^\d{6}$/.test(code.trim())
  const locked = verify.error instanceof ApiError && verify.error.status === 429

  let content
  let footer
  if (result) {
    content = (
      <VStack gap={3}>
        <Banner status="success" title="Download link ready" description="The download should have opened in a new tab. If your browser blocked it, use the link below." />
        <HStack gap={2} vAlign="center">
          <Link href={result.download_url} target="_blank" rel="noopener noreferrer">
            <HStack gap={1} vAlign="center">
              <ExternalLink size={14} aria-hidden /> Open download
            </HStack>
          </Link>
        </HStack>
        <Text type="supporting" color="secondary">
          The link expires in 5 minutes (at {timeOnly(result.expires_at)}) and can only be used from this session. Request a new code if it expires.
        </Text>
      </VStack>
    )
    footer = <Button label="Done" variant="primary" onClick={() => close(false)} />
  } else if (otp) {
    content = (
      <VStack gap={3}>
        <Text>
          A 6-digit code was sent to{' '}
          <strong>{otp.channels.map((c) => CHANNEL_LABEL[c] ?? c).join(' and ') || 'your notification channel'}</strong>. It is valid until{' '}
          {timeOnly(otp.expires_at)}.
        </Text>
        <TextInput
          label="One-time code"
          value={code}
          onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          hasAutoFocus
          placeholder="000000"
          onEnter={() => codeValid && !verify.isPending && verify.mutate()}
          status={verify.error ? { type: 'error', message: errorMessage(verify.error) } : undefined}
        />
        {locked && <Banner status="error" title="Too many wrong attempts" description="This code is locked. Request a new code to try again." />}
        <HStack gap={2} vAlign="center">
          <Button label="Send a new code" variant="ghost" size="sm" isLoading={request.isPending} onClick={() => request.mutate()} />
        </HStack>
      </VStack>
    )
    footer = (
      <>
        <Button label="Cancel" onClick={() => close(false)} />
        <Button label="Verify and download" variant="primary" icon={<Download size={16} />} isDisabled={!codeValid || locked} isLoading={verify.isPending} onClick={() => verify.mutate()} />
      </>
    )
  } else {
    content = (
      <VStack gap={3}>
        <Text>
          Downloads are protected by a one-time code. DumpStation sends the code to your configured notification channels (Discord or Telegram); you enter it here to get a download link valid for 5 minutes.
        </Text>
        <Text type="supporting" color="secondary">
          {backup.name} · {bytes(backup.size_bytes)}
          {backup.dump_format ? ` · ${backup.dump_format === 'custom' ? 'custom format (.dump, use pg_restore)' : 'plain SQL (.sql)'}` : ''}
        </Text>
        {noChannels ? (
          <Banner
            status="warning"
            title="No notification channel configured"
            description={
              <>
                {errorMessage(requestErr)}. <Link href="/notifications">Set up notifications</Link>
              </>
            }
          />
        ) : requestErr ? (
          <Banner status="error" title="Could not send the code" description={errorMessage(requestErr)} />
        ) : null}
      </VStack>
    )
    footer = (
      <>
        <Button label="Cancel" onClick={() => close(false)} />
        <Button label="Send code" variant="primary" isLoading={request.isPending} isDisabled={noChannels} onClick={() => request.mutate()} />
      </>
    )
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={close} purpose="form" width={500}>
      <Layout
        height="auto"
        header={<DialogHeader title="Download backup" subtitle={backup.name} onOpenChange={close} />}
        content={<LayoutContent padding={4}>{content}</LayoutContent>}
        footer={
          <LayoutFooter padding={4}>
            <HStack gap={2} hAlign="end">
              {footer}
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
