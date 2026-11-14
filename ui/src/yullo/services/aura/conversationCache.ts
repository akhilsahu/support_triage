import type { AuraMessage, PublicSpace } from './types'

export interface ConversationHistoryItem {
  id: string
  title: string
  updatedAt: number | null
}

function cachePrefix(space: PublicSpace, accountId?: string) {
  return `yullo:${space.id || space.handle}:${accountId ? `account:${accountId}:` : ''}conversation:`
}

export function readConversationCache(space: PublicSpace, id: string, accountId?: string) {
  try {
    const legacyPrefix = `yullo:${space.handle || 'default'}`
    const cached = localStorage.getItem(`${cachePrefix(space, accountId)}${id}:messages`)
      ?? (!accountId && localStorage.getItem(`${legacyPrefix}:conversationId`) === id
        ? localStorage.getItem(`${legacyPrefix}:messages`) : null)
    if (!cached) return null
    const parsed = JSON.parse(cached)
    // Older caches stored the message array directly and have no known timestamp.
    const rawMessages = Array.isArray(parsed) ? parsed : parsed?.version === 1 ? parsed.messages : null
    if (!Array.isArray(rawMessages)) return null
    const messages: AuraMessage[] = rawMessages.filter((message): message is AuraMessage => message
      && typeof message.id === 'string' && typeof message.text === 'string'
      && ['user', 'aura'].includes(message.role) && Array.isArray(message.ui)
      && ['streaming', 'complete', 'error'].includes(message.status)
    ).map(message => ({ ...message, status: message.status === 'streaming' ? 'error' : message.status }))
    const updatedAt = Number.isFinite(parsed?.updatedAt) && parsed.updatedAt > 0 && parsed.updatedAt <= 8.64e15
      ? parsed.updatedAt as number : null
    return { messages, updatedAt }
  } catch {
    return null
  }
}

export function writeConversationCache(space: PublicSpace, id: string, messages: AuraMessage[], accountId?: string) {
  try {
    localStorage.setItem(`${cachePrefix(space, accountId)}${id}:messages`, JSON.stringify({
      version: 1, updatedAt: Date.now(), messages,
    }))
  } catch { /* Storage limits must not interrupt a response. */ }
}

export function listConversationHistory(space: PublicSpace, accountId?: string): ConversationHistoryItem[] {
  const history: ConversationHistoryItem[] = []
  const prefix = cachePrefix(space, accountId)
  try {
    // Discover only this Space's cached IDs; no second message store or public session listing.
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key?.startsWith(prefix) || !key.endsWith(':messages')) continue
      const id = key.slice(prefix.length, -':messages'.length)
      if (!id) continue
      const cached = readConversationCache(space, id, accountId)
      if (!cached) continue
      const question = cached.messages.find(message => message.role === 'user')?.text.trim()
      if (!question) continue
      history.push({ id, title: question.replace(/\s+/g, ' ').slice(0, 100), updatedAt: cached.updatedAt })
    }
  } catch { /* Browsers may disable local storage. Chat still works without history. */ }
  return history.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.id.localeCompare(b.id))
}

/** Cache only the pending question for accounts; completed transcripts stay server-side. */
export function cachePendingQuestion(space: PublicSpace, id: string, messages: AuraMessage[], accountId: string) {
  if (messages[messages.length - 1]?.status === 'error' || messages[messages.length - 1]?.role === 'user') {
    const question = [...messages].reverse().find(message => message.role === 'user')
    if (question && readConversationCache(space, id, accountId)?.messages[0]?.id !== question.id) writeConversationCache(space, id, [question, {
      id: `retry_${question.id}`, role: 'aura', text: '', ui: [], citations: [], status: 'error',
    }], accountId)
  } else if (messages[messages.length - 1]?.role === 'aura' && messages[messages.length - 1]?.status === 'complete') {
    try { localStorage.removeItem(`${cachePrefix(space, accountId)}${id}:messages`) } catch { /* Optional draft cache. */ }
  }
}

const proofMemory = new Map<string, string>()
export function saveGuestProof(spaceId: string, id: string, token: string) {
  const key = `yullo:${spaceId}:conversation:${id}:access`
  proofMemory.set(key, token)
  try { localStorage.setItem(key, token) } catch { /* This tab can still continue. */ }
}

export function guestProof(spaceId: string, id: string): string | null {
  const key = `yullo:${spaceId}:conversation:${id}:access`
  try { return proofMemory.get(key) || localStorage.getItem(key) } catch { return proofMemory.get(key) || null }
}

export function browserProofs(space: PublicSpace) {
  return listConversationHistory(space).flatMap(item => {
    const token = guestProof(space.id || space.handle, item.id)
    return token && /^[a-f0-9]{64}$/.test(token) && /^[a-f0-9-]{36}$/i.test(item.id) ? [{ session_id: item.id, token }] : []
  })
}

export function removeClaimedGuestCache(space: PublicSpace, id: string) {
  const key = `${cachePrefix(space)}${id}`
  proofMemory.delete(`${key}:access`)
  try {
    localStorage.removeItem(`${key}:access`)
    localStorage.removeItem(`${key}:messages`)
  } catch { /* Account history remains on the server. */ }
}
