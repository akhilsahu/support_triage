import { useState, useCallback, useEffect, useRef } from 'react'
import { auraProvider } from '../services/aura'
import { AuraMessage, AuraUINode, PublicSpace, AuraEvent } from '../services/aura/types'
import { cachePendingQuestion, listConversationHistory, readConversationCache, writeConversationCache, type ConversationHistoryItem } from '../services/aura/conversationCache'

import { accountHistory, accountTranscript, claimBrowserHistory } from '../services/aura/accountHistory'

function failedQuestion(messages: AuraMessage[]) {
  return messages[messages.length - 1]?.status === 'error'
    ? [...messages].reverse().find(message => message.role === 'user')?.text || null
    : null
}

export function useAuraChat(space: PublicSpace, options: { persist?: boolean; network?: boolean; accountId?: string | null; authReady?: boolean } = {}) {
  const persist = options.persist ?? true
  const network = options.network ?? true
  const accountId = options.accountId || null
  const authReady = options.authReady ?? true
  const scope = accountId || 'guest'
  const scopeRef = useRef<string | null>(null)
  const versionRef = useRef(0)
  const streamAbortRef = useRef<AbortController | null>(null)
  const restoringRef = useRef(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const historyRequestRef = useRef(0)
  const [historyLoadError, setHistoryLoadError] = useState('')
  const [historySyncError, setHistorySyncError] = useState('')
  const [historyOpenError, setHistoryOpenError] = useState('')
  const historyError = historyOpenError || historyLoadError || historySyncError
  const pendingRestoreRef = useRef<string | null>(null)
  const needsClaimRef = useRef(false)
  const retryOlderRef = useRef(false)
  const [historyBefore, setHistoryBefore] = useState<string | null>(null)
  const [messagesBefore, setMessagesBefore] = useState<string | null>(null)
  const [conversationId, setConversationIdState] = useState<string | null>(() => {
    if (!persist || !space.id) return null
    return new URLSearchParams(window.location.search).get('chat')?.trim() || null
  })
  const conversationIdRef = useRef<string | null>(conversationId)

  const [messages, setMessages] = useState<AuraMessage[]>(() =>
    persist && authReady && !accountId && conversationId ? readConversationCache(space, conversationId)?.messages || [] : []
  )
  const [history, setHistory] = useState<ConversationHistoryItem[]>([])
  const messagesRef = useRef(messages)
  const [isTyping, setIsTyping] = useState(false)
  const inFlightRef = useRef(false)
  const [isSending, setIsSending] = useState(false)
  const failedMessageRef = useRef<string | null>(failedQuestion(messages))
  const refreshHistory = useCallback(async (before?: string | null) => {
    if (!persist || !authReady) return
    const version = versionRef.current
    const request = ++historyRequestRef.current
    if (!accountId) { setHistory(listConversationHistory(space)); return }
    setHistoryLoading(true)
    try {
      const page = await accountHistory(space, accountId, before)
      if (version !== versionRef.current || request !== historyRequestRef.current) return
      setHistory(current => before ? [...current, ...page.items.filter(item => !current.some(old => old.id === item.id))] : page.items)
      setHistoryBefore(page.before)
      setHistoryLoadError('')
    } catch { if (version === versionRef.current && request === historyRequestRef.current) setHistoryLoadError('Could not load your saved chats. Please try again.') }
    finally { if (version === versionRef.current && request === historyRequestRef.current) setHistoryLoading(false) }
  }, [accountId, authReady, persist, space.id, space.handle])

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
    if (persist && id && !accountId) writeConversationCache(space, id, next)
    if (persist && id && accountId) cachePendingQuestion(space, id, next, accountId)
  }, [accountId, persist, space.id, space.handle])

  // Sync messages to localStorage
  const setMessagesWithCache = useCallback((updater: AuraMessage[] | ((prev: AuraMessage[]) => AuraMessage[])) => {
    const next = typeof updater === 'function' ? updater(messagesRef.current) : updater
    messagesRef.current = next
    cacheMessages(next)
    setMessages(next)
  }, [cacheMessages])

  const displayConversation = useCallback((id: string, data: { messages: AuraMessage[]; before: string | null }) => {
    setConversationId(id)
    messagesRef.current = data.messages
    setMessages(data.messages)
    setMessagesBefore(data.before)
    failedMessageRef.current = failedQuestion(data.messages)
    pendingRestoreRef.current = null
    retryOlderRef.current = false
  }, [setConversationId])

  const selectConversation = useCallback(async (id: string) => {
    if (!persist || !authReady || inFlightRef.current || restoringRef.current) return false
    const version = versionRef.current
    restoringRef.current = true
    setIsRestoring(true)
    try {
      const data = accountId ? await accountTranscript(space, accountId, id) : { messages: readConversationCache(space, id)?.messages || [], before: null }
      if (version !== versionRef.current) return false
      if (!accountId && !data.messages.length) { void refreshHistory(); return false }
      displayConversation(id, data)
      setHistoryOpenError('')
      return true
    } catch {
      if (version === versionRef.current) {
        pendingRestoreRef.current = id
        setHistoryOpenError('Could not open this chat. Choose another chat or try again.')
      }
      return false
    } finally {
      if (version === versionRef.current) { restoringRef.current = false; setIsRestoring(false) }
    }
  }, [accountId, authReady, displayConversation, persist, refreshHistory, space.id, space.handle])

  const newConversation = useCallback(() => {
    if (inFlightRef.current || restoringRef.current) return false
    setConversationId(null)
    setMessagesWithCache([])
    setMessagesBefore(null)
    failedMessageRef.current = null
    pendingRestoreRef.current = null
    retryOlderRef.current = false
    setHistoryOpenError('')
    return true
  }, [setConversationId, setMessagesWithCache])

  const loadOlderMessages = useCallback(async () => {
    const id = conversationIdRef.current
    if (!accountId || !id || !messagesBefore || inFlightRef.current || restoringRef.current) return
    const version = versionRef.current
    restoringRef.current = true
    setIsRestoring(true)
    try {
      const page = await accountTranscript(space, accountId, id, messagesBefore)
      if (version !== versionRef.current) return
      messagesRef.current = [...page.messages, ...messagesRef.current]
      setMessages(messagesRef.current)
      setMessagesBefore(page.before)
      retryOlderRef.current = false
      setHistoryOpenError('')
    } catch { if (version === versionRef.current) { retryOlderRef.current = true; setHistoryOpenError('Could not load earlier messages. Please try again.') } }
    finally { if (version === versionRef.current) { restoringRef.current = false; setIsRestoring(false) } }
  }, [accountId, messagesBefore, space.id])

  const restoreAccountHistory = useCallback(async (id: string | null) => {
    if (!persist || !authReady || !accountId || inFlightRef.current || restoringRef.current) return
    const version = versionRef.current
    restoringRef.current = true
    setIsRestoring(true)
    try {
      // Claiming browser chats is independent of opening an already-owned account chat.
      try {
        await claimBrowserHistory(space, accountId)
        if (version !== versionRef.current) return
        needsClaimRef.current = false
        setHistorySyncError('')
      } catch {
        if (version !== versionRef.current) return
        needsClaimRef.current = true
        setHistorySyncError('Could not sync chats from this browser. Please try again.')
      }
      if (id) {
        try {
          const data = await accountTranscript(space, accountId, id)
          if (version !== versionRef.current) return
          displayConversation(id, data)
          setHistoryOpenError('')
        } catch (reason) {
          if (version !== versionRef.current) return
          const status = (reason as { response?: { status?: number } })?.response?.status
          if (status === 404 || status === 422) {
            pendingRestoreRef.current = null
            if (conversationIdRef.current === id) {
              setConversationId(null)
              messagesRef.current = []
              setMessages([])
              setMessagesBefore(null)
              failedMessageRef.current = null
            }
            setHistoryOpenError('This chat is unavailable. Choose another chat or start a new one.')
          } else {
            // Keep the requested session so a transient failure can be retried.
            pendingRestoreRef.current = id
            setHistoryOpenError('Could not open this chat. Please try again.')
          }
        }
      }
    } finally {
      if (version === versionRef.current) {
        restoringRef.current = false
        setIsRestoring(false)
        void refreshHistory()
      }
    }
  }, [accountId, authReady, displayConversation, persist, refreshHistory, setConversationId, space.id, space.handle])

  const retryHistory = useCallback(() => {
    if (!authReady || inFlightRef.current || restoringRef.current) return
    if (retryOlderRef.current) { void loadOlderMessages(); return }
    if (accountId && (needsClaimRef.current || pendingRestoreRef.current)) {
      void restoreAccountHistory(pendingRestoreRef.current)
      return
    }
    setHistoryOpenError('')
    void refreshHistory()
  }, [accountId, authReady, loadOlderMessages, refreshHistory, restoreAccountHistory])

  useEffect(() => {
    if (!authReady) return
    versionRef.current += 1
    let id = conversationIdRef.current
    if (scopeRef.current !== null && scopeRef.current !== scope) { id = null; setConversationId(null) }
    scopeRef.current = scope
    inFlightRef.current = false
    failedMessageRef.current = null
    setIsSending(false)
    setIsTyping(false)
    setHistory([])
    setHistoryLoading(false)
    setHistoryBefore(null)
    setMessagesBefore(null)
    setHistoryLoadError('')
    setHistorySyncError('')
    setHistoryOpenError('')
    pendingRestoreRef.current = null
    needsClaimRef.current = false
    retryOlderRef.current = false
    restoringRef.current = false
    messagesRef.current = []
    setMessages([])
    if (persist && accountId) {
      void restoreAccountHistory(id)
    } else {
      restoringRef.current = false
      setIsRestoring(false)
      if (persist && id) displayConversation(id, { messages: readConversationCache(space, id)?.messages || [], before: null })
      if (persist) void refreshHistory()
    }
    return () => { versionRef.current += 1; streamAbortRef.current?.abort() }
  }, [scope, authReady, persist, space.id, space.handle, displayConversation, refreshHistory, restoreAccountHistory, setConversationId])

  const runMessage = useCallback(async (text: string, addUserMessage: boolean) => {
    if (!text.trim() || !space.id || !authReady || inFlightRef.current || restoringRef.current) return
    const version = versionRef.current
    const controller = new AbortController()
    streamAbortRef.current = controller
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
          if (controller.signal.aborted) { resolve(); return }
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
          const newConvId = await auraProvider.startConversation(spaceId, accountId)
          if (controller.signal.aborted || version !== versionRef.current) return null
          setConversationId(newConvId)
          cacheMessages(messagesRef.current)
          return newConvId
        } catch (e) {
          console.error("Failed to start conversation", e)
          return null
        }
      }

      const showFailure = (currentAuraMsgId: string | null) => {
        if (controller.signal.aborted || version !== versionRef.current) return
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
              if (controller.signal.aborted || version !== versionRef.current) return
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
              if (controller.signal.aborted) return
              console.error("Aura stream error", error)
              streamError = error
            },
            onComplete: () => {
              if (controller.signal.aborted || version !== versionRef.current) return
              if (currentAuraMsgId) {
                setMessagesWithCache(prev => prev.map(msg =>
                  msg.id === currentAuraMsgId
                    ? { ...msg, status: 'complete' }
                    : msg
                ))
              }
              setIsTyping(false)
            }
          }, controller.signal, accountId)
        } catch (error) {
          streamError = error instanceof Error ? error : new Error("Aura could not respond")
        }
        return { currentAuraMsgId, streamError: streamError as Error | null }
      }

      let sessionId = conversationIdRef.current || await startConversation()
      if (controller.signal.aborted || version !== versionRef.current) return
      if (!sessionId) {
        showFailure(null)
        return
      }

      let result = await streamMessage(sessionId)
      if (controller.signal.aborted || version !== versionRef.current) return
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
      if (version === versionRef.current) {
        inFlightRef.current = false
        setIsSending(false)
        setIsTyping(false)
        void refreshHistory()
      }
    }
  }, [accountId, authReady, cacheMessages, network, refreshHistory, setConversationId, setMessagesWithCache, space.displayName, space.id, space.landingContent])

  const sendMessage = useCallback((text: string) => runMessage(text, true), [runMessage])

  const retryLastMessage = useCallback(() => {
    const text = failedMessageRef.current
    if (!text || inFlightRef.current) return
    setMessagesWithCache(prev => prev.filter(message => message.status !== 'error'))
    void runMessage(text, false)
  }, [isTyping, runMessage, setMessagesWithCache])

  return {
    messages: authReady && scopeRef.current === scope ? messages : [],
    conversationId,
    history: authReady && scopeRef.current === scope ? history : [],
    historyLoading,
    historyError,
    isRestoring,
    messagesBefore,
    loadOlderMessages,
    historyBefore,
    loadMoreHistory: () => refreshHistory(historyBefore),
    refreshHistory,
    retryHistory,
    selectConversation,
    newConversation,
    sendMessage,
    isTyping,
    isSending: isSending || isRestoring || !authReady,
    retryLastMessage
  }
}
