import { createFileRoute } from '@tanstack/react-router'
import { SecuritySection } from '@/components/settings/SecuritySection'

export const Route = createFileRoute('/_app/settings/security')({ component: SecuritySection })
