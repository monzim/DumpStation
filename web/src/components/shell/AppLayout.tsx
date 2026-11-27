import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { AppShell } from '@astryxdesign/core/AppShell'
import { SideNav, SideNavCollapseButton, SideNavHeading, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { Avatar } from '@astryxdesign/core/Avatar'
import { Banner } from '@astryxdesign/core/Banner'
import { Badge } from '@astryxdesign/core/Badge'
import { HStack, VStack, StackItem } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import {
  Activity,
  Bell,
  CalendarClock,
  Cpu,
  Database,
  HardDrive,
  HeartPulse,
  LayoutDashboard,
  ArchiveRestore,
  Settings,
  Users,
  Monitor,
  Moon,
  MoonStar,
  Sun,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  TableProperties,
} from 'lucide-react'
import { displayName, useSession } from '@/lib/auth/session'
import { useThemeMode } from '@/lib/theme/mode'
import { useOverview } from '@/lib/api/hooks'
import { Wordmark } from '../Wordmark'
import { Kbd } from '@astryxdesign/core/Kbd'
import { CommandMenu, useCommandMenuShortcut } from './CommandMenu'

const NAV_KEY = 'ds.sidenav.collapsed'
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** Side nav collapse state, persisted per browser; Ctrl/⌘+B toggles it. */
function useNavCollapse() {
  const [isCollapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(NAV_KEY) === '1'
    } catch {
      return false
    }
  })
  const onCollapsedChange = useCallback((next: boolean) => {
    setCollapsed(next)
    try {
      localStorage.setItem(NAV_KEY, next ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'b' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      e.preventDefault()
      onCollapsedChange(!isCollapsed)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isCollapsed, onCollapsedChange])
  return { isCollapsed, onCollapsedChange }
}

function useActive() {
  const path = useRouterState({ select: (s) => s.location.pathname })
  return (prefix: string) => (prefix === '/' ? path === '/' : path === prefix || path.startsWith(prefix + '/'))
}

export function AppLayout({ children }: { children: ReactNode }) {
  const isActive = useActive()
  const { user, isAdmin, isDemo, signOut } = useSession()
  const { mode, setMode } = useThemeMode()
  const overview = useOverview()
  const ov = overview.data
  const name = displayName(user)
  const collapse = useNavCollapse()
  const collapsed = collapse.isCollapsed
  const [paletteOpen, setPaletteOpen] = useState(false)
  useCommandMenuShortcut(setPaletteOpen)
  const { isCollapsed: navCollapsed, onCollapsedChange } = collapse
  const toggleSidebar = useCallback(() => onCollapsedChange(!navCollapsed), [navCollapsed, onCollapsedChange])
  const themeItem = (m: typeof mode, label: string, icon: ReactNode) => ({
    label,
    icon,
    onClick: () => setMode(m),
    endContent: mode === m ? <Badge label="On" /> : undefined,
  })

  const nav = (
    <SideNav
      aria-label="Primary"
      collapsible={{ ...collapse, hasButton: false }}
      header={<SideNavHeading heading="DumpStation" icon={<img className="ds-wordmark-logo" src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width={22} height={22} aria-hidden />} headingHref="/" />}
      topContent={
        <button
          type="button"
          className="ds-search-trigger"
          data-collapsed={collapsed || undefined}
          onClick={() => setPaletteOpen(true)}
          aria-label="Search and run commands"
          aria-keyshortcuts="Control+K Meta+K"
          title={collapsed ? 'Search (Ctrl+K)' : undefined}
        >
          <Search size={16} aria-hidden />
          {!collapsed && (
            <>
              <span className="ds-search-trigger-label">Search…</span>
              <span className="ds-search-trigger-kbd"><Kbd keys="mod+k" /></span>
            </>
          )}
        </button>
      }
      footer={
        <div className="ds-nav-footer" data-collapsed={collapsed || undefined}>
          <div className="ds-nav-footer-account">
            <DropdownMenu
              menuWidth={220}
              placement={collapsed ? 'end' : 'above'}
              renderTrigger={(props) => (
                <button
                  type="button"
                  {...props}
                  className="ds-account-trigger"
                  data-collapsed={collapsed || undefined}
                  aria-label="Account and preferences"
                  title={collapsed ? name || 'Account' : undefined}
                >
                  {collapsed ? (
                    <HStack hAlign="center">
                      <Avatar name={name || 'User'} src={user?.avatar_url} size="sm" tooltip={false} />
                    </HStack>
                  ) : (
                  <HStack gap={2} vAlign="center">
                    <Avatar name={name || 'User'} src={user?.avatar_url} size="sm" tooltip={false} />
                    <StackItem size="fill">
                      <VStack gap={0}>
                        <Text weight="medium" maxLines={1}>
                          {name || 'Signed in'}
                        </Text>
                        <Text type="supporting" color="secondary" maxLines={1}>
                          {isDemo ? 'Demo (read-only)' : isAdmin ? 'Administrator' : 'Member'}
                        </Text>
                      </VStack>
                    </StackItem>
                  </HStack>
                  )}
                </button>
              )}
              items={[
                {
                  type: 'section',
                  title: 'Theme',
                  items: [
                    themeItem('system', 'System', <Monitor size={16} />),
                    themeItem('light', 'Light', <Sun size={16} />),
                    themeItem('dark', 'Dark', <Moon size={16} />),
                    themeItem('black', 'Black', <MoonStar size={16} />),
                  ],
                },
                { type: 'divider' },
                { label: 'Account settings', icon: <Settings size={16} />, href: '/settings/profile' },
                { label: 'Sign out', icon: <LogOut size={16} />, onClick: () => void signOut('manual') },
              ]}
            />
          </div>
          <Tooltip
            placement={collapsed ? 'end' : 'above'}
            content={
              <span>
                {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                <span className="ds-tooltip-shortcut">{IS_MAC ? '⌘B' : 'Ctrl+B'}</span>
              </span>
            }
          >
            <SideNavCollapseButton
              label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-keyshortcuts="Control+B Meta+B"
            >
              {collapsed ? <PanelLeftOpen size={16} aria-hidden /> : <PanelLeftClose size={16} aria-hidden />}
            </SideNavCollapseButton>
          </Tooltip>
        </div>
      }
    >
      <SideNavSection title="Workspace">
        <SideNavItem label="Overview" icon={LayoutDashboard} href="/" isSelected={isActive('/')} />
        <SideNavItem
          label="Databases"
          icon={Database}
          href="/databases"
          isSelected={isActive('/databases')}
          endContent={ov && ov.databases.attention > 0 ? <Badge variant="warning" label={String(ov.databases.attention)} /> : undefined}
        />
        <SideNavItem
          label="Backups"
          icon={ArchiveRestore}
          href="/backups"
          isSelected={isActive('/backups') || isActive('/restores')}
          endContent={ov && ov.backups.active > 0 ? <Badge variant="info" label={String(ov.backups.active)} /> : undefined}
        />
        <SideNavItem
          label="Backup Agents"
          icon={Cpu}
          href="/agents"
          isSelected={isActive('/agents')}
          endContent={ov && ov.agents.offline > 0 ? <Badge variant="error" label={String(ov.agents.offline)} /> : undefined}
        />
      </SideNavSection>
      <SideNavSection title="Configuration">
        <SideNavItem label="Storage" icon={HardDrive} href="/storage" isSelected={isActive('/storage')} />
        <SideNavItem label="Schedules" icon={CalendarClock} href="/schedules" isSelected={isActive('/schedules')} />
        <SideNavItem label="Notifications" icon={Bell} href="/notifications" isSelected={isActive('/notifications')} />
      </SideNavSection>
      <SideNavSection title="Monitoring">
        <SideNavItem label="Activity" icon={Activity} href="/activity" isSelected={isActive('/activity')} />
        <SideNavItem label="System Health" icon={HeartPulse} href="/system" isSelected={isActive('/system')} />
      </SideNavSection>
      <SideNavSection title="Tools">
        <SideNavItem label="DB Explorer" icon={TableProperties} href="/explorer" isSelected={isActive('/explorer')} />
      </SideNavSection>
      <SideNavSection title="Administration">
        <SideNavItem label="Settings" icon={Settings} href="/settings" isSelected={isActive('/settings')} />
        {isAdmin && <SideNavItem label="Users" icon={Users} href="/users" isSelected={isActive('/users')} />}
      </SideNavSection>
    </SideNav>
  )

  return (
    <AppShell
      sideNav={nav}
      variant="elevated"
      banner={
        isDemo ? (
          <Banner status="info" container="section" title="You are exploring the read-only demo. Changes are disabled." collapsible={false} />
        ) : undefined
      }
    >
      {children}
      <CommandMenu isOpen={paletteOpen} onOpenChange={setPaletteOpen} onToggleSidebar={toggleSidebar} />
    </AppShell>
  )
}

export { Wordmark }
