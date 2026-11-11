import { useState, useCallback, useRef } from 'react'
import { auraProvider } from '../services/aura'
import { AuraMessage, AuraUINode, PublicSpace, AuraEvent } from '../services/aura/types'

export function useAuraChat(space: PublicSpace, options: { persist?: boolean; network?: boolean } = {}) {
  const persist = options.persist ?? true
  const network = options.network ?? true
  const legacyCachePrefix = `yullo:${space?.handle || 'default'}`
  const cachePrefix = `yullo:${space.id || space.handle}:conversation`
  const [conversationId, setConversationIdState] = useState<string | null>(() => {
    if (!persist || !space.id) return null
    return new URLSearchParams(window.location.search).get('chat')?.trim() || null
  })
  const conversationIdRef = useRef<string | null>(conversationId)

  const [messages, setMessages] = useState<AuraMessage[]>(() => {
    try {
      if (!persist || !conversationId) return []
      const cached = localStorage.getItem(`${cachePrefix}:${conversationId}:messages`)
        ?? (localStorage.getItem(`${legacyCachePrefix}:conversationId`) === conversationId
          ? localStorage.getItem(`${legacyCachePrefix}:messages`) : null)
      const parsed = cached ? JSON.parse(cached) : []
      if (!Array.isArray(parsed)) return []
      return parsed.filter((message): message is AuraMessage => message
        && typeof message.id === 'string' && typeof message.text === 'string'
        && ['user', 'aura'].includes(message.role) && Array.isArray(message.ui)
        && ['streaming', 'complete', 'error'].includes(message.status)
      ).map(message => ({ ...message, status: message.status === 'streaming' ? 'error' : message.status }))
    } catch {
      return []
    }
  })
  const messagesRef = useRef(messages)
  const [isTyping, setIsTyping] = useState(false)
  const inFlightRef = useRef(false)
  const [isSending, setIsSending] = useState(false)
  const failedMessageRef = useRef<string | null>(
    messages[messages.length - 1]?.status === 'error'
      ? [...messages].reverse().find(message => message.role === 'user')?.text || null
      : null
  )

  // Keep ref in sync
  const setConversationId = useCallback((id: string | null) => {
    setConversationIdState(id)
    conversationIdRef.current = id
    if (persist) {
      const url = new URL(window.location.href)
      if (id) url.searchParams.set('chat', id)
      else url.searchParams.delete('chat')
      // Bookmark the active chat without navigating or remounting its live stream.
      window.history.replaceState(window.history.state, '', url)
    }
  }, [persist])

  const cacheMessages = useCallback((next: AuraMessage[]) => {
    const id = conversationIdRef.current
    try {
      if (persist && id) localStorage.setItem(`${cachePrefix}:${id}:messages`, JSON.stringify(next))
    } catch { /* Storage limits must not interrupt a response. */ }
  }, [cachePrefix, persist])

  // Sync messages to localStorage
  const setMessagesWithCache = useCallback((updater: AuraMessage[] | ((prev: AuraMessage[]) => AuraMessage[])) => {
    const next = typeof updater === 'function' ? updater(messagesRef.current) : updater
    messagesRef.current = next
    cacheMessages(next)
    setMessages(next)
  }, [cacheMessages])

  const runMessage = useCallback(async (text: string, addUserMessage: boolean) => {
    if (!text.trim() || !space.id || inFlightRef.current) return
    inFlightRef.current = true
    setIsSending(true)
    const spaceId = space.id
    try {

      if (addUserMessage) {
        const userMessage: AuraMessage = {
          id: `user_${Date.now()}`,
          role: 'user',
          text,
          ui: [],
          citations: [],
          status: 'complete'
        }
        setMessagesWithCache(prev => [...prev, userMessage])
      }

      if (!network) {
        const normalized = text.toLowerCase()
        const sectionType = normalized.includes('work') || normalized.includes('portfolio')
          ? 'portfolio'
          : normalized.includes('where') || normalized.includes('location')
            ? 'location'
            : 'services'
        const section = space.landingContent?.sections.find((item) => item.type === sectionType)
          || space.landingContent?.sections.find((item) => item.items.length > 0)
        const item = section?.items[0]
        const nodeType = section?.type === 'portfolio' ? 'portfolio' : section?.type === 'location' ? 'location' : section?.type === 'services' ? 'service' : null
        const messageId = `aura_preview_${Date.now()}`
        setIsTyping(true)
        await new Promise<void>(resolve => window.setTimeout(() => {
          const ui: AuraUINode[] = item && nodeType ? [{
            type: nodeType,
            entity: {
              id: item.sourceEntityId || item.key,
              space_id: spaceId,
              entity_type: nodeType === 'service' ? 'offering' : nodeType === 'portfolio' ? 'portfolio_item' : 'location',
              title: item.title,
              payload_json: { title: item.title, name: item.title, description: item.description || undefined },
            },
          } as AuraUINode] : []
          setMessagesWithCache(prev => [...prev, {
            id: messageId,
            role: 'aura',
            text: item
              ? `Here is how Aura can present ${space.displayName}'s confirmed information.`
              : `Aura responses for ${space.displayName} will appear here using confirmed Space knowledge.`,
            ui,
            citations: [],
            status: 'complete',
          }])
          setIsTyping(false)
          resolve()
        }, 220))
        return
      }
      setIsTyping(true)

      const startConversation = async () => {
        try {
          const newConvId = await auraProvider.startConversation(spaceId)
          setConversationId(newConvId)
          cacheMessages(messagesRef.current)
          return newConvId
        } catch (e) {
          console.error("Failed to start conversation", e)
          return null
        }
      }

      const showFailure = (currentAuraMsgId: string | null) => {
        failedMessageRef.current = text
        if (currentAuraMsgId) {
          setMessagesWithCache(prev => prev.map(msg =>
            msg.id === currentAuraMsgId ? { ...msg, status: 'error' } : msg
          ))
        } else {
          setMessagesWithCache(prev => [
            ...prev,
            {
              id: `aura_error_${Date.now()}`,
              role: 'aura',
              text: '',
              ui: [],
              citations: [],
              status: 'error'
            }
          ])
        }
        setIsTyping(false)
      }

      const streamMessage = async (sessionId: string) => {
        let currentAuraMsgId: string | null = null
        let streamError: Error | null = null

        try {
          await auraProvider.sendMessage(spaceId, sessionId, text, {
            onEvent: (event: AuraEvent) => {
              if (event.type === 'message.start') {
                currentAuraMsgId = event.messageId
                setMessagesWithCache(prev => [
                  ...prev,
                  {
                    id: event.messageId,
                    role: 'aura',
                    text: '',
                    ui: [],
                    citations: [],
                    status: 'streaming'
                  }
                ])
                setIsTyping(false) // Typing indicator stops when message actually starts streaming
              } else if (event.type === 'text.delta' && currentAuraMsgId) {
                setMessagesWithCache(prev => prev.map(msg =>
                  msg.id === currentAuraMsgId
                    ? { ...msg, text: msg.text + event.delta }
                    : msg
                ))
              } else if (event.type === 'ui.add' && currentAuraMsgId) {
                setMessagesWithCache(prev => prev.map(msg =>
                  msg.id === currentAuraMsgId
                    ? { ...msg, ui: [...msg.ui, event.node] }
                    : msg
                ))
              } else if (event.type === 'citation.add' && currentAuraMsgId) {
                setMessagesWithCache(prev => prev.map(msg =>
                  msg.id === currentAuraMsgId
                    ? { ...msg, citations: [...(msg.citations || []), event.citation] }
                    : msg
                ))
              }
            },
            onError: (error: Error) => {
              console.error("Aura stream error", error)
              streamError = error
            },
            onComplete: () => {
              if (currentAuraMsgId) {
                setMessagesWithCache(prev => prev.map(msg =>
                  msg.id === currentAuraMsgId
                    ? { ...msg, status: 'complete' }
                    : msg
                ))
              }
              setIsTyping(false)
            }
          })
        } catch (error) {
          streamError = error instanceof Error ? error : new Error("Aura could not respond")
        }
        return { currentAuraMsgId, streamError: streamError as Error | null }
      }

      let sessionId = conversationIdRef.current || await startConversation()
      if (!sessionId) {
        showFailure(null)
        return
      }

      let result = await streamMessage(sessionId)
      const staleSession = result.streamError && /session.*(not found|invalid|expired)/i.test(result.streamError.message)
      if (staleSession) {
        setConversationId(null)
        sessionId = await startConversation()
        if (sessionId) result = await streamMessage(sessionId)
      }

      if (result.streamError) {
        showFailure(result.currentAuraMsgId)
      } else {
        failedMessageRef.current = null
      }
    } finally {
      inFlightRef.current = false
      setIsSending(false)
      setIsTyping(false)
    }
  }, [cacheMessages, network, setConversationId, setMessagesWithCache, space.displayName, space.id, space.landingContent])

  const sendMessage = useCallback((text: string) => runMessage(text, true), [runMessage])

  const retryLastMessage = useCallback(() => {
    const text = failedMessageRef.current
    if (!text || inFlightRef.current) return
    setMessagesWithCache(prev => prev.filter(message => message.status !== 'error'))
    void runMessage(text, false)
  }, [isTyping, runMessage, setMessagesWithCache])

  return {
    messages,
    sendMessage,
    isTyping,
    isSending,
    retryLastMessage
  }
}
