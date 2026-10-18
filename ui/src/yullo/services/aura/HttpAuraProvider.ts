import { AuraProvider, AuraStreamHandlers } from './AuraProvider'
import { PublicSpace, AuraEvent } from './types'

export class HttpAuraProvider implements AuraProvider {
  private readonly baseUrl: string

  constructor(baseUrl: string = '/api/v1') {
    this.baseUrl = baseUrl
  }

  async getPublicSpace(handle: string): Promise<PublicSpace | null> {
    const response = await fetch(`${this.baseUrl}/yullo/public/spaces/${handle}`)
    if (!response.ok) {
      if (response.status === 404) return null
      throw new Error(`Failed to fetch public space: ${response.statusText}`)
    }
    return response.json()
  }

  async startConversation(spaceId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/yullo/public/spaces/${spaceId}/aura/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to start conversation: ${response.statusText}`)
    }
    
    const data = await response.json()
    return data.session_id
  }

  async sendMessage(
    spaceId: string,
    conversationId: string,
    message: string,
    handlers: AuraStreamHandlers
  ): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseUrl}/yullo/public/spaces/${spaceId}/aura/sessions/${conversationId}/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            space_id: spaceId,
            session_id: conversationId,
            message: message
          }),
        }
      )

      if (!response.ok) {
        throw new Error(`Chat request failed: ${response.statusText}`)
      }

      if (!response.body) {
        throw new Error('Response body is null')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        
        // Keep the last partial line in the buffer
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim()
            if (!dataStr) continue
            
            try {
              const event = JSON.parse(dataStr) as AuraEvent
              handlers.onEvent(event)
              
              if (event.type === 'message.done' || event.type === 'error') {
                // If it's done or error, we still let the stream finish naturally, 
                // but the backend will close it soon.
              }
            } catch (e) {
              console.error('Failed to parse SSE event:', e, dataStr)
            }
          }
        }
      }
      
      handlers.onComplete()
    } catch (error) {
      handlers.onError(error instanceof Error ? error : new Error(String(error)))
    }
  }
}
