import { Outlet, createFileRoute, useRouterState } from '@tanstack/react-router'
import { TabList, Tab } from '@astryxdesign/core/TabList'
import { Banner } from '@astryxdesign/core/Banner'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { useSession } from '@/lib/auth/session'

export const Route = createFileRoute('/_app/settings')({ component: SettingsLayout })

const SECTIONS = [
  { value: 'profile', label: 'Profile' },
  { value: 'security', label: 'Security' },
  { value: 'labels', label: 'Labels' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'about', label: 'About' },
] as const

function SettingsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const current = SECTIONS.find((s) => pathname.startsWith(`/settings/${s.value}`))?.value ?? 'profile'
  const { isDemo } = useSession()
  return (
    <Page width="wide">
      <PageHeader title="Settings" description="Your account, sign-in security, labels and instance maintenance." />
      <TabList value={current} onChange={() => {}} hasDivider overflow="auto">
        {SECTIONS.map((s) => (
          <Tab key={s.value} value={s.value} label={s.label} href={`/settings/${s.value}`} />
        ))}
      </TabList>
      {isDemo && (
        <Banner
          status="info"
          title="Demo account: settings are read-only"
          description="You can look around, but changes (avatar, two-factor authentication, labels, maintenance) are disabled for the shared demo user."
        />
      )}
      <Outlet />
    </Page>
  )
}
