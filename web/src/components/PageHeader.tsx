import type { ReactNode } from 'react'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Heading, Text } from '@astryxdesign/core/Text'
import { Breadcrumbs, BreadcrumbItem } from '@astryxdesign/core/Breadcrumbs'

export interface Crumb {
  label: string
  href?: string
}

/**
 * Consistent page header: breadcrumbs, title, supporting description and
 * context actions (primary action last).
 */
export function PageHeader({
  title,
  description,
  crumbs,
  actions,
  meta,
}: {
  title: ReactNode
  description?: ReactNode
  crumbs?: Crumb[]
  actions?: ReactNode
  meta?: ReactNode
}) {
  return (
    <VStack gap={2}>
      {crumbs && crumbs.length > 0 && (
        <Breadcrumbs variant="supporting">
          {crumbs.map((c, i) => (
            <BreadcrumbItem key={i} href={c.href} isCurrent={i === crumbs.length - 1 && !c.href}>
              {c.label}
            </BreadcrumbItem>
          ))}
        </Breadcrumbs>
      )}
      <HStack gap={3} vAlign="center" wrap="wrap">
        <StackItem size="fill">
          <VStack gap={1}>
            <Heading level={1}>{title}</Heading>
            {description && (
              <Text type="supporting" color="secondary">
                {description}
              </Text>
            )}
          </VStack>
        </StackItem>
        {actions && (
          <HStack gap={2} vAlign="center" wrap="wrap">
            {actions}
          </HStack>
        )}
      </HStack>
      {meta}
    </VStack>
  )
}
