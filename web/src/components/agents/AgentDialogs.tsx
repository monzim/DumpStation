import { useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from '@astryxdesign/core/Layout'
import { Button } from '@astryxdesign/core/Button'
import { Selector } from '@astryxdesign/core/Selector'
import { Text } from '@astryxdesign/core/Text'
import { Banner } from '@astryxdesign/core/Banner'
import { useIssueEnrollment, useUpdateAgent } from '@/lib/api/hooks'
import { ApiError, errorMessage } from '@/lib/api/client'
import type { Agent, EnrollmentResponse } from '@/lib/api/types'
import { useNotify } from '@/components/common'
import { AgentFields, agentToForm, formToInput, validateAgentForm, type AgentFormState } from './AgentFields'
import { EnrollmentResult } from './EnrollmentResult'
import { TTL_OPTIONS } from './deploy'

export function EditAgentDialog({ agent, isOpen, onOpenChange }: { agent: Agent; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={560}>
      {isOpen && <EditAgentForm agent={agent} onClose={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function EditAgentForm({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [form, setForm] = useState<AgentFormState>(() => agentToForm(agent))
  const [submitted, setSubmitted] = useState(false)
  const update = useUpdateAgent(agent.id)
  const notify = useNotify()
  const errors = submitted ? validateAgentForm(form) : {}
  const serverErrors = update.error instanceof ApiError ? update.error.fieldErrors : undefined
  const save = () => {
    setSubmitted(true)
    if (Object.keys(validateAgentForm(form)).length > 0) return
    update.mutate(formToInput(form), {
      onSuccess: () => {
        notify.success('Agent updated')
        onClose()
      },
    })
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <Layout
        height="auto"
        header={<DialogHeader title="Edit agent" onOpenChange={() => onClose()} />}
        content={
          <LayoutContent padding={4}>
            <VStack gap={4}>
              <AgentFields
                value={form}
                onChange={setForm}
                errors={errors}
                serverErrors={serverErrors}
                agentAllowsRestore={agent.enrolled_at ? agent.agent_allow_restore : undefined}
              />
              {update.error ? <Banner status="error" title={errorMessage(update.error)} /> : null}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter padding={4}>
            <HStack gap={2} hAlign="end">
              <Button label="Cancel" onClick={onClose} />
              <Button label="Save changes" variant="primary" type="submit" isLoading={update.isPending} />
            </HStack>
          </LayoutFooter>
        }
      />
    </form>
  )
}

/**
 * Issue a new enrollment token for an existing agent (redeploy, rotate the
 * credential, or re-enroll after revocation). The token stays in this
 * dialog's state and disappears when it closes.
 */
export function RotateCredentialDialog({ agent, isOpen, onOpenChange }: { agent: Agent; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  const [ttl, setTtl] = useState('60')
  const [result, setResult] = useState<EnrollmentResponse | null>(null)
  const issue = useIssueEnrollment()
  const close = (o: boolean) => {
    if (!o) {
      setResult(null)
      issue.reset()
    }
    onOpenChange(o)
  }
  const revoked = agent.status === 'revoked'
  const pending = agent.status === 'pending'
  const title = revoked ? 'Re-enroll agent' : pending ? 'Issue a new enrollment token' : 'Rotate credential / redeploy'
  return (
    <Dialog isOpen={isOpen} onOpenChange={close} purpose={result ? 'required' : 'form'} width={result ? 820 : 520} maxHeight="90dvh">
      <Layout
        height="auto"
        header={<DialogHeader title={title} subtitle={agent.name} onOpenChange={close} />}
        content={
          <LayoutContent padding={4}>
            {result ? (
              <EnrollmentResult enrollment={result} maxHeight={320} />
            ) : (
              <VStack gap={4}>
                <Text>
                  {revoked
                    ? 'The agent was revoked. A new token lets you deploy it again; it becomes active once it enrolls.'
                    : pending
                      ? 'Any earlier enrollment token is replaced by the new one.'
                      : 'Use this to move the agent to a new host or to rotate its credential. The current credential keeps working until the agent enrolls with the new token; from then on the old one is rejected.'}
                </Text>
                {!revoked && !pending && (
                  <Text type="supporting" color="secondary">
                    To redeploy in place, clear the agent's state volume (/var/lib/dumpstation-agent) or start a fresh container with the new token.
                  </Text>
                )}
                <Selector label="Token lifetime" options={TTL_OPTIONS} value={ttl} onChange={(v) => setTtl(v ?? '60')} />
                {issue.error ? <Banner status="error" title={errorMessage(issue.error)} /> : null}
              </VStack>
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter padding={4}>
            <HStack gap={2} hAlign="end">
              {result ? (
                <Button label="I've copied the token" variant="primary" onClick={() => close(false)} />
              ) : (
                <>
                  <Button label="Cancel" onClick={() => close(false)} />
                  <Button
                    label="Issue token"
                    variant="primary"
                    isLoading={issue.isPending}
                    onClick={() => issue.mutate({ id: agent.id, ttlMinutes: Number(ttl) }, { onSuccess: setResult })}
                  />
                </>
              )}
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
