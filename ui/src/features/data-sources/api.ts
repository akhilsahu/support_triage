import { apiClient } from '../../api/client'
import type { DataSourceDraft } from './types'

export const dataSourceOnboardingApi = {
  async import(kind: 'curl' | 'openapi', content: string) {
    return apiClient.importDataSourceDraft({ kind, content }) as Promise<{ drafts: DataSourceDraft[] }>
  },
  async analyze(draft: DataSourceDraft, sample: unknown, useAI: boolean) {
    return apiClient.analyzeDataSourceDraft({ draft, sample, use_ai: useAI })
  },
  async test(draft: DataSourceDraft, chatbotId: string, credential: string, args: Record<string, string>) {
    return apiClient.testDataSourceDraft({ draft, chatbot_id: chatbotId, credential: credential || null, arguments: args })
  },
}
