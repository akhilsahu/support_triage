import { yulloApiClient } from '../../api/client'
import type { AuraMessage, PublicSpace } from './types'
import { browserProofs, cachePendingQuestion, guestProof, listConversationHistory, readConversationCache, removeClaimedGuestCache, type ConversationHistoryItem } from './conversationCache'

export async function claimBrowserHistory(space: PublicSpace, accountId: string) {
  const proofs = browserProofs(space)
  for (let offset = 0; offset < proofs.length; offset += 50) {
    const { data } = await yulloApiClient.post<{ claimed: string[] }>(`/public/spaces/${space.id}/aura/sessions/claim`, { proofs: proofs.slice(offset, offset + 50) }, { headers: { 'X-Yullo-Chat-Account': accountId } })
    data.claimed.forEach(id => {
      cachePendingQuestion(space, id, readConversationCache(space, id)?.messages || [], accountId)
      removeClaimedGuestCache(space, id)
    })
  }
}

export async function accountHistory(space: PublicSpace, accountId: string, before?: string | null) {
  const { data } = await yulloApiClient.get<{ items: ConversationHistoryItem[]; before: string | null }>(`/public/spaces/${space.id}/aura/sessions`, { params: { before: before || undefined }, headers: { 'X-Yullo-Chat-Account': accountId } })
  if (!before) {
    const drafts = listConversationHistory(space, accountId).map(item => ({ ...item, title: `Draft: ${item.title}` }))
    data.items = [...drafts, ...data.items.filter(item => !drafts.some(draft => draft.id === item.id))]
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  }
  return data
}

export async function accountTranscript(space: PublicSpace, accountId: string, id: string, before?: string | null) {
  const token = guestProof(space.id!, id)
  const { data } = await yulloApiClient.get<{ messages: AuraMessage[]; before: string | null }>(`/public/spaces/${space.id}/aura/sessions/${id}`, {
    params: { before: before || undefined }, headers: { 'X-Yullo-Chat-Account': accountId, ...(token ? { 'X-Yullo-Chat-Token': token } : {}) },
  })
  if (!before) data.messages.push(...(readConversationCache(space, id, accountId)?.messages || []))
  return data
}
