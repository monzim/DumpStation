import type { ReactNode } from 'react'
import { VStack } from '@astryxdesign/core/Layout'

/** Standard page body: padded, vertically stacked sections, optional max width. */
export function Page({ children, width }: { children: ReactNode; width?: 'form' | 'wide' | 'full' }) {
  const maxWidth = width === 'form' ? 760 : width === 'wide' ? 1280 : undefined
  return (
    <VStack gap={5} padding={6} width="100%" maxWidth={maxWidth} style={{ marginInline: maxWidth ? 'auto' : undefined, boxSizing: 'border-box' }}>
      {children}
    </VStack>
  )
}
