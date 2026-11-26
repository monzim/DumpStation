import { VStack, HStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { ExternalLink } from 'lucide-react'
import { Panel, Facts } from '@/components/common'
import { useSystemHealth } from '@/lib/api/hooks'

const REPO = 'https://github.com/monzim/DumpStation'

function Ext({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer">
      <HStack gap={1} vAlign="center" as="span">
        {children}
        <ExternalLink size={12} aria-hidden />
      </HStack>
    </Link>
  )
}

export function AboutSection() {
  const health = useSystemHealth()
  const webVersion = window.APP_CONFIG?.VERSION
  const serverVersion = health.data?.version
  return (
    <VStack gap={4}>
      <Panel title="DumpStation" description="Self-hosted PostgreSQL backup console with remote backup agents for private networks.">
        <Facts
          items={[
            {
              label: 'Server version',
              value: health.isLoading ? <Skeleton width={80} height={18} /> : <Text className="ds-mono">{serverVersion ?? (health.error ? 'Unavailable' : '—')}</Text>,
            },
            { label: 'Web app version', value: <Text className="ds-mono">{webVersion || serverVersion || 'dev'}</Text> },
            ...(health.data?.pg_client_versions?.length
              ? [{ label: 'pg_dump clients', value: <Text className="ds-mono">{health.data.pg_client_versions.join(', ')}</Text> }]
              : []),
            { label: 'License', value: <Ext href={`${REPO}/blob/main/LICENSE`}>MIT</Ext> },
          ]}
        />
      </Panel>
      <Panel title="Resources">
        <VStack gap={2}>
          <Ext href={REPO}>Source code on GitHub</Ext>
          <Ext href={`${REPO}#readme`}>README and documentation</Ext>
          <Ext href={`${REPO}/releases`}>Releases and changelog</Ext>
          <Ext href={`${REPO}/issues`}>Report an issue</Ext>
        </VStack>
        <Text type="supporting" color="secondary">
          Runtime details such as uptime, scheduler and job settings are on the <Link href="/system">System</Link> page.
        </Text>
      </Panel>
    </VStack>
  )
}
