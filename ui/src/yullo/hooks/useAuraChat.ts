import { useState, useCallback, useRef } from 'react'
import { auraProvider } from '../services/aura'
import { AuraMessage, AuraUINode, PublicSpace, AuraEvent } from '../services/aura/types'

export function useAuraChat(space: PublicSpace) {
  const cacheKeyMessages = `yullo:${space?.handle || 'default'}:messages`
  const cacheKeyConv = `yullo:${space?.handle || 'default'}:conversationId`

  const [messages, setMessages] = useState<AuraMessage[]>(() => {
    try {
      const cached = localStorage.getItem(cacheKeyMessages)
      return cached ? JSON.parse(cached) : []
    } catch {
      return []
    }
  })
  const [isTyping, setIsTyping] = useState(false)
  const [conversationId, setConversationIdState] = useState<string | null>(() => {
    if (!space?.id) return null
    return localStorage.getItem(cacheKeyConv) || null
  })
  const conversationIdRef = useRef<string | null>(conversationId)

  // Keep ref in sync
  const setConversationId = useCallback((id: string | null) => {
    setConversationIdState(id)
    conversationIdRef.current = id
  }, [])

  // Sync messages to localStorage
  const setMessagesWithCache = useCallback((updater: AuraMessage[] | ((prev: AuraMessage[]) => AuraMessage[])) => {
    setMessages(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      localStorage.setItem(cacheKeyMessages, JSON.stringify(next))
      return next
    })
  }, [cacheKeyMessages])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !space.id) return

    // 1. Add user message
    const userMessage: AuraMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      text,
      ui: [],
      citations: [],
      status: 'complete'
    }
    setMessagesWithCache(prev => [...prev, userMessage])
    setIsTyping(true)

    // 2. Initialize conversation if needed
    if (!conversationIdRef.current) {
      try {
        const newConvId = await auraProvider.startConversation(space.id)
        conversationIdRef.current = newConvId
        localStorage.setItem(cacheKeyConv, newConvId)
      } catch (e) {
        console.error("Failed to start conversation", e)
        setIsTyping(false)
        return
      }
    }

    // 3. Setup current Aura message state
    let currentAuraMsgId: string | null = null

    try {
      await auraProvider.sendMessage(space.id, conversationIdRef.current, text, {
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
          if (currentAuraMsgId) {
             setMessagesWithCache(prev => prev.map(msg => 
              msg.id === currentAuraMsgId 
                ? { ...msg, status: 'error' }
                : msg
            ))
          }
          setIsTyping(false)
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
    } catch (e) {
      console.error("Failed to send message", e)
      setIsTyping(false)
    }
  }, [space.id])

  return {
    messages,
    sendMessage,
    isTyping
  }
}
