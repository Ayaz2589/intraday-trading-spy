import { createFileRoute } from '@tanstack/react-router'
import { DocsPage } from '@/components/docs/DocsPage'

// The Docs page: how the app works, what each page does, and the glossary
// (rendered from HELP_CONTENT — the same source as the ? tooltips).
export const Route = createFileRoute('/_authenticated/docs')({
  component: DocsPage,
})
