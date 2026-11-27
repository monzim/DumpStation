import { createFileRoute } from '@tanstack/react-router'
import { LabelsSection } from '@/components/settings/LabelsSection'

export const Route = createFileRoute('/_app/settings/labels')({ component: LabelsSection })
