import { useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from '@astryxdesign/core/Layout'
import { Grid } from '@astryxdesign/core/Grid'
import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Banner } from '@astryxdesign/core/Banner'
import { Divider } from '@astryxdesign/core/Divider'
import { Heading, Text } from '@astryxdesign/core/Text'
import { useSaveNotification } from '@/lib/api/hooks'
import { ApiError, errorMessage } from '@/lib/api/client'
import type { NotificationConfig, NotificationInput } from '@/lib/api/types'
import { useNotify } from '@/components/common'

interface FormState {
  name: string
  discord: string
  botToken: string
  chatId: string
  clearDiscord: boolean
  clearTelegram: boolean
}

type Errors = Partial<Record<'name' | 'discord' | 'botToken' | 'chatId' | 'channels', string>>

function validate(f: FormState, existing?: NotificationConfig): Errors {
  const e: Errors = {}
  if (!f.name.trim()) e.name = 'Name is required'
  const discord = f.discord.trim()
  if (discord) {
    try {
      const u = new URL(discord)
      if (u.protocol !== 'https:' || !/(^|\.)discord(app)?\.com$/.test(u.hostname) || !u.pathname.startsWith('/api/webhooks/'))
        e.discord = 'Use a Discord webhook URL: https://discord.com/api/webhooks/…'
    } catch {
      e.discord = 'Use a Discord webhook URL: https://discord.com/api/webhooks/…'
    }
  }
  const token = f.botToken.trim()
  const chat = f.chatId.trim()
  if (token && !/^\d+:[\w-]{20,}$/.test(token)) e.botToken = 'Bot tokens look like 123456789:AA…'
  if (chat && !/^(-?\d+|@[\w]{4,})$/.test(chat)) e.chatId = 'Use a numeric chat ID (e.g. -1001234567890) or @channelname'

  const hadDiscord = !!existing?.has_discord && !f.clearDiscord
  const hadTelegram = !!existing?.has_telegram && !f.clearTelegram
  // A new Telegram pair needs both values unless one is already stored.
  if (!hadTelegram) {
    if (token && !chat) e.chatId = 'Chat ID is required with a bot token'
    if (chat && !token) e.botToken = 'Bot token is required with a chat ID'
  }
  const willDiscord = hadDiscord || !!discord
  const willTelegram = hadTelegram || (!!token && !!chat)
  if (!willDiscord && !willTelegram) e.channels = 'Configure Discord, Telegram, or both.'
  return e
}

function toInput(f: FormState): NotificationInput {
  const discord = f.discord.trim()
  const token = f.botToken.trim()
  const chat = f.chatId.trim()
  return {
    name: f.name.trim(),
    discord_webhook_url: discord || undefined,
    telegram_bot_token: token || undefined,
    telegram_chat_id: chat || undefined,
    clear_discord: f.clearDiscord && !discord ? true : undefined,
    clear_telegram: f.clearTelegram && !token && !chat ? true : undefined,
  }
}

export function NotificationDialog({ channel, isOpen, onOpenChange }: { channel?: NotificationConfig; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={600} maxHeight="90dvh">
      {isOpen && <NotificationForm channel={channel} onClose={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function NotificationForm({ channel, onClose }: { channel?: NotificationConfig; onClose: () => void }) {
  const isEdit = !!channel
  const [form, setForm] = useState<FormState>({ name: channel?.name ?? '', discord: '', botToken: '', chatId: '', clearDiscord: false, clearTelegram: false })
  const [submitted, setSubmitted] = useState(false)
  const save = useSaveNotification(channel?.id)
  const notify = useNotify()
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))
  const errors = submitted ? validate(form, channel) : {}
  const serverErrors = save.error instanceof ApiError ? save.error.fieldErrors : {}
  const st = (k: keyof Errors, server?: string) => {
    const m = errors[k] ?? (server ? serverErrors[server] : undefined)
    return m ? { type: 'error' as const, message: m } : undefined
  }

  const submit = () => {
    setSubmitted(true)
    if (Object.keys(validate(form, channel)).length > 0) return
    save.mutate(toInput(form), {
      onSuccess: (n) => {
        notify.success(isEdit ? `Channel ${n.name} updated` : `Channel ${n.name} created`)
        onClose()
      },
    })
  }

  const discordStored = !!channel?.has_discord
  const telegramStored = !!channel?.has_telegram

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Layout
        height="auto"
        header={<DialogHeader title={isEdit ? `Edit ${channel!.name}` : 'Add notification channel'} onOpenChange={() => onClose()} />}
        content={
          <LayoutContent padding={4}>
            <VStack gap={4}>
              <TextInput label="Name" value={form.name} onChange={(v) => set({ name: v })} isRequired status={st('name', 'name')} placeholder="Ops alerts" autoComplete="off" />
              <Divider />
              <VStack gap={3}>
                <Heading level={4}>Discord</Heading>
                {discordStored && (
                  <Text type="supporting" color="secondary">
                    Stored webhook: <span className="ds-mono">{channel!.discord_webhook_url}</span>
                  </Text>
                )}
                <TextInput
                  label={discordStored ? 'New webhook URL' : 'Webhook URL'}
                  value={form.discord}
                  onChange={(v) => set({ discord: v })}
                  isOptional
                  isDisabled={form.clearDiscord}
                  placeholder="https://discord.com/api/webhooks/…"
                  description={discordStored ? 'Leave blank to keep the stored webhook.' : 'Server settings → Integrations → Webhooks → Copy webhook URL.'}
                  status={st('discord', 'discord_webhook_url')}
                  type="url"
                  autoComplete="off"
                />
                {discordStored && (
                  <CheckboxInput
                    label="Remove Discord from this channel"
                    value={form.clearDiscord}
                    onChange={(v) => set({ clearDiscord: v, discord: v ? '' : form.discord })}
                  />
                )}
              </VStack>
              <Divider />
              <VStack gap={3}>
                <Heading level={4}>Telegram</Heading>
                {telegramStored && (
                  <Text type="supporting" color="secondary">
                    Stored bot <span className="ds-mono">{channel!.telegram_bot_token}</span> → chat <span className="ds-mono">{channel!.telegram_chat_id}</span>
                  </Text>
                )}
                <Grid columns={{ minWidth: 220, max: 2 }} gap={4}>
                  <TextInput
                    label={telegramStored ? 'New bot token' : 'Bot token'}
                    type="password"
                    value={form.botToken}
                    onChange={(v) => set({ botToken: v })}
                    isOptional
                    isDisabled={form.clearTelegram}
                    placeholder={telegramStored ? 'Stored' : '123456789:AA…'}
                    description={telegramStored ? 'Leave blank to keep.' : 'From @BotFather.'}
                    status={st('botToken', 'telegram_bot_token')}
                    autoComplete="off"
                  />
                  <TextInput
                    label={telegramStored ? 'New chat ID' : 'Chat ID'}
                    value={form.chatId}
                    onChange={(v) => set({ chatId: v })}
                    isOptional
                    isDisabled={form.clearTelegram}
                    placeholder={telegramStored ? 'Stored' : '-1001234567890'}
                    description={telegramStored ? 'Leave blank to keep.' : 'Add the bot to the chat first.'}
                    status={st('chatId', 'telegram_chat_id')}
                    autoComplete="off"
                  />
                </Grid>
                {telegramStored && (
                  <CheckboxInput
                    label="Remove Telegram from this channel"
                    value={form.clearTelegram}
                    onChange={(v) => set({ clearTelegram: v, botToken: v ? '' : form.botToken, chatId: v ? '' : form.chatId })}
                  />
                )}
              </VStack>
              {errors.channels && <Banner status="error" title={errors.channels} />}
              {save.error ? <Banner status="error" title={isEdit ? 'Could not save changes' : 'Could not create the channel'} description={errorMessage(save.error)} /> : null}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter padding={4}>
            <HStack gap={2} hAlign="end">
              <Button label="Cancel" onClick={onClose} />
              <Button label={isEdit ? 'Save changes' : 'Add channel'} variant="primary" type="submit" isLoading={save.isPending} />
            </HStack>
          </LayoutFooter>
        }
      />
    </form>
  )
}
