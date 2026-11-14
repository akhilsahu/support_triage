import { AuraProvider, AuraStreamHandlers } from './AuraProvider'
import { PublicSpace, AuraEvent } from './types'
import { AppearancePreviewContentSchema } from '../../screens/appearance/preview/types'
import { yulloFetch, YULLO_API_ORIGIN } from '../../api/client'
import { guestProof, saveGuestProof } from './conversationCache'

export class HttpAuraProvider implements AuraProvider {
  private readonly baseUrl: string

  constructor(baseUrl: string = `${YULLO_API_ORIGIN.replace(/\/$/, '')}/api/v1`) {
    this.baseUrl = baseUrl
  }

  async getPublicSpace(handle: string): Promise<PublicSpace | null> {
    const segments = handle.split('/').map(encodeURIComponent).join('/');
    const route = handle.includes('/') ? 'paths' : 'spaces';
    const response = await fetch(`${this.baseUrl}/yullo/public/${route}/${segments}`)
    if (!response.ok) {
      if (response.status === 404) return null
      throw new Error(`Failed to fetch public space: ${response.statusText}`)
    }
    const data = await response.json() as PublicSpace
    if (data.landingContent) {
      const parsed = AppearancePreviewContentSchema.safeParse(data.landingContent)
      data.landingContent = parsed.success ? parsed.data : undefined
    }
    return data
  }

  async startConversation(spaceId: string, accountId?: string | null): Promise<string> {
    const response = await yulloFetch(`${this.baseUrl}/yullo/public/spaces/${spaceId}/aura/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Yullo-Chat-Account': accountId || 'guest',
      }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to start conversation: ${response.statusText}`)
    }
    
    const data = await response.json()
    if (data.guest_token) saveGuestProof(spaceId, data.session_id, data.guest_token)
    return data.session_id
  }

  async sendMessage(
    spaceId: string,
    conversationId: string,
    message: string,
    handlers: AuraStreamHandlers,
    signal?: AbortSignal,
    accountId?: string | null,
  ): Promise<void> {
    try {
      const token = guestProof(spaceId, conversationId)
      const response = await yulloFetch(
        `${this.baseUrl}/yullo/public/spaces/${spaceId}/aura/sessions/${conversationId}/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Yullo-Chat-Account': accountId || 'guest',
            ...(token ? { 'X-Yullo-Chat-Token': token } : {}),
          },
          signal,
          body: JSON.stringify({
            space_id: spaceId,
            session_id: conversationId,
            message: message
          }),
        }
      )

      if (!response.ok) {
        throw new Error(response.status === 404 ? 'Session not found or expired' : `Chat request failed: ${response.statusText}`)
      }

      if (!response.body) {
        throw new Error('Response body is null')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let streamError: Error | null = null
      let started = false
      let completed = false
      let hasContent = false

      const processLine = (line: string) => {
        if (!line.startsWith('data:')) return
        const dataStr = line.slice(5).trim()
        if (!dataStr) return

        if (completed || streamError) return
        const event = JSON.parse(dataStr) as AuraEvent
        if (!event || typeof event.type !== 'string') throw new Error('Invalid response event')
        if (event.type === 'error') {
          streamError = new Error(event.message || 'Aura could not respond')
          return
        }
        if (event.type === 'message.start') {
          if (started || typeof event.messageId !== 'string' || !event.messageId.trim()) throw new Error('Invalid response start')
          started = true
        } else {
          if (!started) throw new Error('Response has not started')
          if (event.type === 'text.delta') {
            if (typeof event.delta !== 'string') throw new Error('Invalid response text')
            hasContent ||= !!event.delta.trim()
          } else if (event.type === 'ui.add') {
            const node = event.node
            if (!node || !['service', 'location', 'portfolio', 'actions', 'images'].includes(node.type)) throw new Error('Invalid response card')
            // Public streaming cards reference server-authorized entities, not inline payloads.
            if (node.type === 'images') {
              if (!Array.isArray(node.imageIds) || !node.imageIds.length || node.imageIds.length > 4 || node.imageIds.some(id => typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id))) throw new Error('Invalid response images')
            } else if (node.type === 'actions') {
              if (!Array.isArray(node.entityIds) || !node.entityIds.length || node.entityIds.length > 4 || node.entityIds.some(id => typeof id !== 'string' || !id.trim())) throw new Error('Invalid response card')
            } else if (typeof node.entityId !== 'string' || !node.entityId.trim()) {
              throw new Error('Invalid response card')
            }
            if ('entity' in node || 'entities' in node) throw new Error('Invalid response card')
            hasContent = true
          } else if (event.type === 'citation.add') {
            const citation = event.citation
            if (!citation || typeof citation.id !== 'string' || typeof citation.label !== 'string'
              || (citation.snippet !== undefined && typeof citation.snippet !== 'string')
              || (citation.sourceUrl !== undefined && typeof citation.sourceUrl !== 'string')) throw new Error('Invalid response reference')
          } else if (event.type === 'message.done') {
            if (!hasContent) throw new Error('Aura returned an empty response')
            completed = true
          }
        }
        handlers.onEvent(event)
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        
        // Keep the last partial line in the buffer
        buffer = lines.pop() || ''

        for (const line of lines) {
          try {
            processLine(line)
          } catch (error) {
            streamError = new Error('Aura returned an unreadable response')
            break
          }
        }

        if (streamError || completed) {
          await reader.cancel()
          break
        }
      }

      buffer += decoder.decode()
      if (!streamError && !completed && buffer.trim()) processLine(buffer)

      if (streamError) {
        handlers.onError(streamError)
        return
      }
      if (!completed) throw new Error('Aura response was interrupted. Please try again.')
      handlers.onComplete()
    } catch (error) {
      handlers.onError(error instanceof Error ? error : new Error(String(error)))
    }
  }
}
