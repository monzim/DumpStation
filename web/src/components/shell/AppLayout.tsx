import type { ReactNode } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { AppShell } from '@astryxdesign/core/AppShell'
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav'
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
  Sun,
  LogOut,
  TableProperties,
} from 'lucide-react'
import { displayName, useSession } from '@/lib/auth/session'
import { useThemeMode } from '@/lib/theme/mode'
import { useOverview } from '@/lib/api/hooks'
import { Wordmark } from '../Wordmark'

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

  const nav = (
    <SideNav
      aria-label="Primary"
      header={<SideNavHeading heading="DumpStation" icon={<span className="ds-wordmark-dot" aria-hidden />} headingHref="/" />}
      footer={
        <DropdownMenu
          menuWidth={220}
          placement="above"
          renderTrigger={(props) => (
            <button
              type="button"
              {...props}
              style={{
                all: 'unset',
                cursor: 'pointer',
                display: 'block',
                width: '100%',
                padding: 'var(--spacing-2)',
                borderRadius: 'var(--radius-element)',
                boxSizing: 'border-box',
              }}
              aria-label="Account and preferences"
            >
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
            </button>
          )}
          items={[
            {
              type: 'section',
              title: 'Theme',
              items: [
                { label: 'System', icon: <Monitor size={16} />, onClick: () => setMode('system'), endContent: mode === 'system' ? <Badge label="On" /> : undefined },
                { label: 'Light', icon: <Sun size={16} />, onClick: () => setMode('light'), endContent: mode === 'light' ? <Badge label="On" /> : undefined },
                { label: 'Dark', icon: <Moon size={16} />, onClick: () => setMode('dark'), endContent: mode === 'dark' ? <Badge label="On" /> : undefined },
              ],
            },
            { type: 'divider' },
            { label: 'Account settings', icon: <Settings size={16} />, href: '/settings/profile' },
            { label: 'Sign out', icon: <LogOut size={16} />, onClick: () => void signOut('manual') },
          ]}
        />
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
    </AppShell>
  )
}

export { Wordmark }
