import { TabList, Tab } from '@astryxdesign/core/TabList'

/** Switch between the backup history and restore history pages. */
export function JobsTabs({ value }: { value: 'backups' | 'restores' }) {
  return (
    <TabList value={value} onChange={() => {}} hasDivider>
      <Tab value="backups" label="Backups" href="/backups" />
      <Tab value="restores" label="Restores" href="/restores" />
    </TabList>
  )
}
