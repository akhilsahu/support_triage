import type { EvaluationExpectation } from '../../api/client'

export interface EvaluationChatbotOption {
  id: string
  slug: string
  display_name: string
  is_default: boolean
}

export type BooleanExpectation = 'any' | 'yes' | 'no'

export const splitCommaValues = (value: string): string[] =>
  [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))]

export function formatExpectation(expectation: EvaluationExpectation): string[] {
  const labels: string[] = []
  if (expectation.expected_agent) labels.push(`Agent: ${expectation.expected_agent}`)
  if (expectation.required_terms.length) {
    labels.push(`${expectation.required_terms.length} required term${expectation.required_terms.length === 1 ? '' : 's'}`)
  }
  if (expectation.forbidden_terms.length) {
    labels.push(`${expectation.forbidden_terms.length} forbidden term${expectation.forbidden_terms.length === 1 ? '' : 's'}`)
  }
  if (expectation.expected_source_ids.length) {
    labels.push(`${expectation.expected_source_ids.length} source${expectation.expected_source_ids.length === 1 ? '' : 's'}`)
  }
  if (expectation.expected_rag_hit !== null) {
    labels.push(`RAG: ${expectation.expected_rag_hit ? 'Yes' : 'No'}`)
  }
  if (expectation.expected_escalation !== null) {
    labels.push(`Escalation: ${expectation.expected_escalation ? 'Yes' : 'No'}`)
  }
  if (expectation.max_response_ms !== null) labels.push(`≤ ${expectation.max_response_ms}ms`)
  return labels
}

export function runDuration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return 'In progress'
  const milliseconds = Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime())
  if (milliseconds < 1000) return `${milliseconds}ms`
  const seconds = Math.round(milliseconds / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}
