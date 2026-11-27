import { useState } from 'react'
import { VStack } from '@astryxdesign/core/Layout'
import { TabList, Tab } from '@astryxdesign/core/TabList'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Banner } from '@astryxdesign/core/Banner'
import { Text } from '@astryxdesign/core/Text'
import { binaryEnv, dockerCompose, dockerRun, kubernetes, serverUrlWarnings, systemdUnit, type SnippetInput } from './deploy'

type Target = 'docker' | 'compose' | 'k8s' | 'binary'

/**
 * Copyable deployment instructions for an agent. When `token` is omitted the
 * snippets carry a placeholder (used on the agent's Configuration tab).
 */
export function DeploymentInstructions(props: SnippetInput & { maxHeight?: number }) {
  const [target, setTarget] = useState<Target>('docker')
  const warnings = serverUrlWarnings(props.serverUrl)
  const code = { maxHeight: props.maxHeight ?? 420, width: '100%', size: 'sm' as const, style: { maxWidth: '100%', minWidth: 0 } }
  return (
    <VStack gap={3} style={{ minWidth: 0, maxWidth: '100%' }}>
      {warnings.length > 0 && (
        <Banner status="warning" title="Agents may not be able to reach this server URL" collapsible={false}>
          <VStack gap={1}>
            {warnings.map((w) => (
              <Text key={w} type="supporting">
                {w}
              </Text>
            ))}
          </VStack>
        </Banner>
      )}
      <TabList value={target} onChange={(v) => setTarget(v as Target)} hasDivider overflow="auto" role="tablist" aria-label="Deployment method">
        <Tab value="docker" label="Docker" />
        <Tab value="compose" label="Docker Compose" />
        <Tab value="k8s" label="Kubernetes" />
        <Tab value="binary" label="Binary" />
      </TabList>
      {target === 'docker' && (
        <VStack gap={2}>
          <Text type="supporting" color="secondary">
            Run the agent next to your database. Replace DUMPSTATION_CONN_MAIN with a real connection, or add one variable per
            database. Add <code className="ds-mono">--network &lt;name&gt;</code> if PostgreSQL runs in a Docker network.
          </Text>
          <CodeBlock code={dockerRun(props)} language="bash" title="docker run" {...code} />
        </VStack>
      )}
      {target === 'compose' && (
        <VStack gap={2}>
          <Text type="supporting" color="secondary">
            A service with a named volume for the agent's credential, attached to the network your database is on.
          </Text>
          <CodeBlock code={dockerCompose(props)} language="yaml" title="compose.yaml" {...code} />
        </VStack>
      )}
      {target === 'k8s' && (
        <VStack gap={2}>
          <Text type="supporting" color="secondary">
            A Secret for the enrollment token and connection, and a single-replica StatefulSet with a persistent volume for{' '}
            <span className="ds-mono">/var/lib/dumpstation-agent</span>.
          </Text>
          <CodeBlock code={kubernetes(props)} language="yaml" title="dumpstation-agent.yaml" {...code} />
        </VStack>
      )}
      {target === 'binary' && (
        <VStack gap={2}>
          <Text type="supporting" color="secondary">
            Run the agent directly on a Linux host with PostgreSQL client tools installed.
          </Text>
          <CodeBlock code={binaryEnv(props)} language="bash" title="Install and run" {...code} />
          <CodeBlock code={systemdUnit()} language="ini" title="Optional: run as a systemd service" {...code} isCollapsible />
        </VStack>
      )}
    </VStack>
  )
}
