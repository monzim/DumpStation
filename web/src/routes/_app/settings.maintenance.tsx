import { createFileRoute } from '@tanstack/react-router'
import { MaintenanceSection } from '@/components/settings/MaintenanceSection'

export const Route = createFileRoute('/_app/settings/maintenance')({ component: MaintenanceSection })
