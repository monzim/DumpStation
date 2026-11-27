// Settings-area hooks not covered by lib/api/hooks.ts (avatar, 2FA mutations, label CRUD).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, buildUrl, session, ApiError } from '@/lib/api/client'
import { keys } from '@/lib/api/keys'
import type { BackupCodes, Label, TwoFactorSetup, UserProfile } from '@/lib/api/types'

/** Server limit (server/internal/handlers/user_handler.go MaxAvatarSize). */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

/**
 * The uploaded avatar as an object URL. The endpoint needs the bearer token,
 * so it cannot be used as a plain <img src>. Keyed under `me` so profile
 * invalidation refreshes it too.
 */
export function useAvatarUrl(user: UserProfile | undefined) {
  const q = useQuery({
    queryKey: [...keys.me, 'avatar', user?.updated_at],
    enabled: !!user?.has_profile_picture,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch(buildUrl('/users/me/avatar'), { headers: { Authorization: `Bearer ${session.token() ?? ''}` } })
      if (res.status === 404) return null
      if (!res.ok) throw new ApiError(res.status, 'Could not load avatar')
      return URL.createObjectURL(await res.blob())
    },
  })
  return user?.has_profile_picture ? (q.data ?? undefined) : undefined
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => (typeof r.result === 'string' ? resolve(r.result) : reject(new Error('Could not read file')))
    r.onerror = () => reject(r.error ?? new Error('Could not read file'))
    r.readAsDataURL(file)
  })
}

export function useUploadAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => api<UserProfile>('/users/me/avatar', { body: { image: await readAsDataUrl(file) } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  })
}

export function useDeleteAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<UserProfile>('/users/me/avatar', { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  })
}

// ------------------------------------------------------------- 2FA

export const useSetupTwoFactor = () => useMutation({ mutationFn: () => api<TwoFactorSetup>('/auth/2fa/setup', { method: 'POST' }) })

export function useVerifyTwoFactorSetup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => api<BackupCodes>('/auth/2fa/verify-setup', { body: { code } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.twoFactor })
      qc.invalidateQueries({ queryKey: keys.me })
    },
  })
}

export function useDisableTwoFactor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => api<{ message: string }>('/auth/2fa/disable', { body: { code } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.twoFactor })
      qc.invalidateQueries({ queryKey: keys.me })
    },
  })
}

export function useRegenerateBackupCodes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => api<BackupCodes>('/auth/2fa/backup-codes', { body: { code } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.twoFactor }),
  })
}

// ------------------------------------------------------------- labels

export interface LabelInput {
  name: string
  color: string
  description: string
}

export function useSaveLabel(id?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: LabelInput) =>
      id ? api<Label>(`/labels/${id}`, { method: 'PUT', body: input }) : api<Label>('/labels', { body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.labels })
      qc.invalidateQueries({ queryKey: keys.databases.all })
      qc.invalidateQueries({ queryKey: keys.storage.all })
      qc.invalidateQueries({ queryKey: keys.notifications.all })
    },
  })
}

export function useDeleteLabel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/labels/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.labels })
      qc.invalidateQueries({ queryKey: keys.databases.all })
      qc.invalidateQueries({ queryKey: keys.storage.all })
      qc.invalidateQueries({ queryKey: keys.notifications.all })
    },
  })
}

/** Download text as a file. */
export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
