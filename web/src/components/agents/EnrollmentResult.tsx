import { VStack } from '@astryxdesign/core/Layout'
import { Banner } from '@astryxdesign/core/Banner'
import { Text } from '@astryxdesign/core/Text'
import { Card } from '@astryxdesign/core/Card'
import type { EnrollmentResponse } from '@/lib/api/types'
import { CopyValue } from '@/components/common'
import { dateTime, relativeTime } from '@/lib/format'
import { DeploymentInstructions } from './DeploymentInstructions'

/**
 * One-time enrollment token plus deployment snippets. The token lives only in
 * component state: it is never logged, stored or put in a URL.
 */
export function EnrollmentResult({ enrollment, maxHeight }: { enrollment: EnrollmentResponse; maxHeight?: number }) {
  const { agent, enrollment_token: token, expires_at: expiresAt, server_url: serverUrl } = enrollment
  return (
    <VStack gap={4}>
      <Banner
        status="warning"
        title="Copy the enrollment token now. It is shown once."
        description={`Single-use; expires ${relativeTime(expiresAt)} (${dateTime(expiresAt)}). The agent exchanges it for its own credential on first start. If it expires, issue a new token from the agent page.`}
        collapsible={false}
      />
      <Card padding={3}>
        <VStack gap={1}>
          <Text type="label">Enrollment token</Text>
          <CopyValue value={token} label="Copy token" />
        </VStack>
      </Card>
      <VStack gap={2}>
        <Text type="label">Deploy the agent</Text>
        <DeploymentInstructions serverUrl={serverUrl} token={token} allowRestore={agent.allow_restore} name={agent.name} maxHeight={maxHeight} />
      </VStack>
    </VStack>
  )
}
