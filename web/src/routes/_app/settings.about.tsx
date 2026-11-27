import { createFileRoute } from '@tanstack/react-router'
import { AboutSection } from '@/components/settings/AboutSection'

export const Route = createFileRoute('/_app/settings/about')({ component: AboutSection })
