import { createFileRoute } from '@tanstack/react-router'
import { ProfileSection } from '@/components/settings/ProfileSection'

export const Route = createFileRoute('/_app/settings/profile')({ component: ProfileSection })
