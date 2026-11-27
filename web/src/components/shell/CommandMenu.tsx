import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { CommandPalette } from '@astryxdesign/core/CommandPalette'
import type { SearchSource, SearchableItem } from '@astryxdesign/core/Typeahead'
import { HStack, StackItem } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import {
  Activity,
  ArchiveRestore,
  Bell,
  CalendarClock,
  Cpu,
  Database,
  HardDrive,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  MoonStar,
  PanelLeft,
  Plus,
  RotateCcw,
  Settings,
  Sun,
  TableProperties,
  Tags,
  UserCog,
  Users,
  type LucideProps,
} from 'lucide-react'
import { useSession } from '@/lib/auth/session'
import { useThemeMode, type ThemeMode } from '@/lib/theme/mode'
import { useAgents, useDatabases } from '@/lib/api/hooks'

type Group = 'Go to' | 'Create' | 'Databases' | 'Backup agents' | 'Preferences'

interface Command {
  group: Group
  icon: ComponentType<LucideProps>
  hint?: string
  keywords?: string[]
  run: () => void
}

type CommandItem = SearchableItem<Command>

/** Opens on Ctrl/⌘+K from anywhere, including text fields. */
export function useCommandMenuShortcut(setOpen: (fn: (open: boolean) => boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && !e.isComposing) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])
}

export function CommandMenu({
  isOpen,
  onOpenChange,
  onToggleSidebar,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onToggleSidebar: () => void
}) {
  const navigate = useNavigate()
  const { isAdmin, isDemo, signOut } = useSession()
  const { mode, setMode } = useThemeMode()
  const databases = useDatabases()
  const agents = useAgents()
  const [value, setValue] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)

  // Enter with nothing highlighted runs the top result (the cmdk convention):
  // move the highlight to the first option, then let Enter select it.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!isOpen || !dialog) return
    const onKeyDown = (e: KeyboardEvent) => {
      const input = e.target as HTMLElement
      if (e.key !== 'Enter' || e.isComposing || input.tagName !== 'INPUT' || input.getAttribute('aria-activedescendant')) return
      if (!dialog.querySelector('[role="option"]')) return
      e.preventDefault()
      e.stopPropagation()
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      requestAnimationFrame(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    }
    dialog.addEventListener('keydown', onKeyDown, true)
    return () => dialog.removeEventListener('keydown', onKeyDown, true)
  }, [isOpen])

  const items = useMemo<CommandItem[]>(() => {
    const list: CommandItem[] = []
    const add = (id: string, label: string, cmd: Command) => list.push({ id, label, auxiliaryData: cmd })
    const go = (to: string) => () => void navigate({ to })

    // Navigation mirrors the side nav.
    const pages: [string, string, Command['icon'], string[]?][] = [
      ['/', 'Overview', LayoutDashboard, ['home', 'dashboard']],
      ['/databases', 'Databases', Database, ['postgres']],
      ['/backups', 'Backups', ArchiveRestore, ['history', 'dumps']],
      ['/restores', 'Restores', RotateCcw, ['recover']],
      ['/agents', 'Backup agents', Cpu, ['agent', 'runner']],
      ['/storage', 'Storage', HardDrive, ['s3', 'r2', 'bucket', 'destination']],
      ['/schedules', 'Schedules', CalendarClock, ['cron', 'retention']],
      ['/notifications', 'Notifications', Bell, ['discord', 'webhook', 'alerts']],
      ['/activity', 'Activity', Activity, ['audit', 'log']],
      ['/system', 'System health', HeartPulse, ['status', 'tools']],
      ['/explorer', 'DB Explorer', TableProperties, ['sql', 'tables', 'query']],
      ['/settings/profile', 'Account settings', UserCog, ['profile']],
      ['/settings/security', 'Security settings', Settings, ['2fa', 'two-factor', 'totp']],
      ['/settings/labels', 'Labels', Tags, ['tags']],
    ]
    if (isAdmin) pages.push(['/users', 'Users', Users, ['admin', 'members']])
    for (const [to, label, icon, keywords] of pages) add(`go:${to}`, label, { group: 'Go to', icon, keywords, run: go(to) })

    if (!isDemo) {
      add('new:database', 'Add database', { group: 'Create', icon: Plus, keywords: ['new', 'create'], run: go('/databases/new') })
      add('new:agent', 'Add backup agent', { group: 'Create', icon: Plus, keywords: ['new', 'enroll'], run: go('/agents/new') })
    }

    for (const d of databases.data ?? []) {
      add(`db:${d.id}`, d.name, {
        group: 'Databases',
        icon: Database,
        hint: 'Open database',
        run: () => void navigate({ to: '/databases/$id', params: { id: d.id } }),
      })
    }
    for (const a of agents.data ?? []) {
      add(`agent:${a.id}`, a.name, {
        group: 'Backup agents',
        icon: Cpu,
        hint: 'Open agent',
        run: () => void navigate({ to: '/agents/$id', params: { id: a.id } }),
      })
    }

    const themes: [ThemeMode, string, Command['icon']][] = [
      ['system', 'System', Monitor],
      ['light', 'Light', Sun],
      ['dark', 'Dark', Moon],
      ['black', 'Black', MoonStar],
    ]
    for (const [m, label, icon] of themes) {
      add(`theme:${m}`, `Theme: ${label}`, {
        group: 'Preferences',
        icon,
        hint: mode === m ? 'Current' : undefined,
        keywords: ['appearance', 'color', 'mode'],
        run: () => setMode(m),
      })
    }
    add('ui:sidebar', 'Toggle sidebar', { group: 'Preferences', icon: PanelLeft, hint: 'Ctrl+B', keywords: ['collapse', 'expand', 'nav'], run: onToggleSidebar })
    add('auth:signout', 'Sign out', { group: 'Preferences', icon: LogOut, keywords: ['logout'], run: () => void signOut('manual') })
    return list
  }, [navigate, isAdmin, isDemo, databases.data, agents.data, mode, setMode, onToggleSidebar, signOut])

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  // auxiliaryData.group drives the palette's automatic sections. Every word
  // of the query must appear in the label, group or keywords, so
  // "theme dark" and "open prod" both match.
  const source = useMemo<SearchSource<CommandItem>>(() => {
    const haystack = new Map(
      items.map((i) => [i.id, [i.label, i.auxiliaryData?.group ?? '', ...(i.auxiliaryData?.keywords ?? [])].join(' ').toLowerCase()]),
    )
    return {
      bootstrap: () => items,
      search: (query) => {
        const words = query.toLowerCase().split(/[\s:]+/).filter(Boolean)
        return words.length ? items.filter((i) => words.every((w) => haystack.get(i.id)!.includes(w))) : items
      },
    }
  }, [items])

  return (
    <CommandPalette<CommandItem>
      ref={dialogRef}
      isOpen={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open)
        if (!open) setValue('')
      }}
      label="Command menu"
      searchSource={source}
      value={value}
      onValueChange={(id) => {
        setValue('')
        byId.get(id)?.auxiliaryData?.run()
      }}
      emptySearchText="No matching pages, databases or actions"
      renderItem={(item) => {
        const cmd = item.auxiliaryData!
        const Icon = cmd.icon
        return (
          <HStack gap={2} vAlign="center" style={{ width: '100%' }}>
            <Icon size={16} aria-hidden />
            <StackItem size="fill">
              <Text maxLines={1}>{item.label}</Text>
            </StackItem>
            {cmd.hint && (
              <Text type="supporting" color="secondary">
                {cmd.hint}
              </Text>
            )}
          </HStack>
        )
      }}
    />
  )
}
