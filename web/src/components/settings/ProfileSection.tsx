import { useRef, useState } from 'react'
import { Avatar } from '@astryxdesign/core/Avatar'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { Banner } from '@astryxdesign/core/Banner'
import { Upload, Trash2 } from 'lucide-react'
import { Panel, Facts, ConfirmDialog, useNotify } from '@/components/common'
import { BlockSkeleton, ErrorState } from '@/components/states'
import { useMe } from '@/lib/api/hooks'
import { displayName } from '@/lib/auth/session'
import { dateTime, bytes } from '@/lib/format'
import { errorMessage } from '@/lib/api/client'
import { AVATAR_TYPES, MAX_AVATAR_BYTES, useAvatarUrl, useDeleteAvatar, useUploadAvatar } from './api'

export function ProfileSection() {
  const me = useMe()
  const user = me.data
  const avatar = useAvatarUrl(user)
  const upload = useUploadAvatar()
  const remove = useDeleteAvatar()
  const notify = useNotify()
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  if (me.isLoading) return <BlockSkeleton height={260} />
  if (me.error || !user) return <ErrorState error={me.error} onRetry={() => me.refetch()} />

  const name = displayName(user)
  const readOnly = user.is_demo
  const methods = [user.github_login && 'GitHub', user.discord_username && 'Discord'].filter(Boolean) as string[]

  const onFile = async (file: File | undefined) => {
    setFileError(null)
    if (!file) return
    if (!AVATAR_TYPES.includes(file.type)) return setFileError('Use a JPEG, PNG, GIF or WebP image.')
    if (file.size > MAX_AVATAR_BYTES) return setFileError(`That image is ${bytes(file.size)}. The limit is ${bytes(MAX_AVATAR_BYTES)}.`)
    try {
      await upload.mutateAsync(file)
      notify.success('Profile picture updated')
    } catch (e) {
      setFileError(errorMessage(e))
    }
  }

  return (
    <VStack gap={4}>
      <Panel title="Profile picture" description="Shown in the navigation and on activity you create. JPEG, PNG, GIF or WebP up to 2 MB.">
        <HStack gap={4} vAlign="center" wrap="wrap">
          <Avatar src={avatar ?? user.avatar_url} name={name || 'User'} size="xl" tooltip={false} />
          <StackItem size="fill">
            <VStack gap={2}>
              <HStack gap={2} wrap="wrap">
                <Button
                  label={user.has_profile_picture ? 'Replace picture' : 'Upload picture'}
                  icon={<Upload size={14} />}
                  onClick={() => fileRef.current?.click()}
                  isLoading={upload.isPending}
                  isDisabled={readOnly}
                />
                {user.has_profile_picture && (
                  <Button label="Remove" icon={<Trash2 size={14} />} variant="ghost" onClick={() => setConfirmRemove(true)} isDisabled={readOnly} />
                )}
              </HStack>
              <Text type="supporting" color="secondary">
                {user.has_profile_picture
                  ? 'Using your uploaded picture.'
                  : user.avatar_url
                    ? 'Using the picture from your sign-in provider.'
                    : 'No picture yet: your initials are shown.'}
              </Text>
            </VStack>
          </StackItem>
        </HStack>
        <input
          ref={fileRef}
          type="file"
          accept={AVATAR_TYPES.join(',')}
          hidden
          onChange={(e) => {
            void onFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        {fileError && <Banner status="error" title="Could not upload picture" description={fileError} />}
      </Panel>

      <Panel title="Identity" description="Comes from your sign-in provider and cannot be edited here.">
        <Facts
          items={[
            { label: 'Display name', value: name || '—' },
            { label: 'Email', value: user.email || '—' },
            ...(user.github_login ? [{ label: 'GitHub login', value: <Text className="ds-mono">{user.github_login}</Text> }] : []),
            ...(user.discord_username ? [{ label: 'Discord username', value: <Text className="ds-mono">{user.discord_username}</Text> }] : []),
            { label: 'Sign-in method', value: methods.length ? methods.join(', ') : user.is_demo ? 'Demo login' : '—' },
            {
              label: 'Role',
              value: (
                <HStack gap={2} wrap="wrap">
                  <Badge label={user.is_admin ? 'Administrator' : 'Member'} variant={user.is_admin ? 'info' : 'neutral'} />
                  {user.is_demo && <Badge label="Demo (read-only)" variant="warning" />}
                </HStack>
              ),
            },
            { label: 'Two-factor', value: user.two_factor_enabled ? 'Enabled' : 'Not enabled' },
            { label: 'Member since', value: dateTime(user.created_at) },
          ]}
        />
      </Panel>

      <ConfirmDialog
        isOpen={confirmRemove}
        onOpenChange={(o) => {
          setConfirmRemove(o)
          if (!o) remove.reset()
        }}
        title="Remove profile picture"
        description={user.avatar_url ? 'Your uploaded picture is deleted. The picture from your sign-in provider is used instead.' : 'Your uploaded picture is deleted and your initials are shown instead.'}
        actionLabel="Remove picture"
        isLoading={remove.isPending}
        error={remove.error}
        onConfirm={async () => {
          try {
            await remove.mutateAsync()
            notify.success('Profile picture removed')
            setConfirmRemove(false)
          } catch {
            /* inline */
          }
        }}
      />
    </VStack>
  )
}
