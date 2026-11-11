import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useAuraChat } from './useAuraChat'
import { auraProvider } from '../services/aura'
import type { AuraStreamHandlers } from '../services/aura/AuraProvider'

vi.mock('../services/aura', () => ({ auraProvider: { startConversation: vi.fn(), sendMessage: vi.fn() } }))
const space = { id: 'space', handle: 'test', displayName: 'Test', description: '', auraEnabled: true }
beforeEach(() => vi.resetAllMocks())

it('blocks concurrent sends until streaming finishes and releases the lock afterwards', async () => {
  vi.mocked(auraProvider.startConversation).mockResolvedValue('session')
  let finish!: () => void
  let handlers!: AuraStreamHandlers
  vi.mocked(auraProvider.sendMessage).mockImplementation(async (_space, _session, _message, h) => {
    handlers = h
    h.onEvent({ type: 'message.start', messageId: 'response' })
    await new Promise<void>(resolve => { finish = resolve })
    h.onComplete()
  })
  const { result } = renderHook(() => useAuraChat(space, { persist: false }))
  let pending!: Promise<void>
  await act(async () => { pending = result.current.sendMessage('Hello') })
  expect(result.current.isSending).toBe(true)
  expect(result.current.isTyping).toBe(false)
  await act(async () => { await result.current.sendMessage('Duplicate') })
  expect(auraProvider.sendMessage).toHaveBeenCalledTimes(1)
  expect(result.current.messages.filter(m => m.role === 'user')).toHaveLength(1)
  await act(async () => { handlers.onEvent({ type: 'text.delta', delta: 'Hello' }); finish(); await pending })
  expect(result.current.isSending).toBe(false)
  expect(result.current.messages[result.current.messages.length - 1]?.status).toBe('complete')
})

it('preserves partial replies as errors and retries without another user bubble', async () => {
  vi.mocked(auraProvider.startConversation).mockResolvedValue('session')
  vi.mocked(auraProvider.sendMessage).mockImplementationOnce(async (_s, _c, _m, h) => {
    h.onEvent({ type: 'message.start', messageId: 'partial' })
    h.onEvent({ type: 'text.delta', delta: 'Partial answer' })
    throw new Error('Disconnected')
  }).mockImplementationOnce(async (_s, _c, _m, h) => {
    h.onEvent({ type: 'message.start', messageId: 'retry' })
    h.onEvent({ type: 'text.delta', delta: 'Full answer' })
    h.onComplete()
  })
  const { result } = renderHook(() => useAuraChat(space, { persist: false }))
  await act(async () => { await result.current.sendMessage('Hello') })
  expect(result.current.messages[result.current.messages.length - 1]).toMatchObject({ text: 'Partial answer', status: 'error' })
  expect(result.current.isSending).toBe(false)
  await act(async () => { result.current.retryLastMessage() })
  expect(result.current.messages.filter(m => m.role === 'user')).toHaveLength(1)
  expect(result.current.messages[result.current.messages.length - 1]).toMatchObject({ text: 'Full answer', status: 'complete' })
})

it('restores an interrupted reply as retryable after reload', async () => {
  window.history.replaceState(window.history.state, '', '/test?chat=new-session')
  localStorage.setItem('yullo:test:conversationId', 'new-session')
  localStorage.setItem('yullo:test:messages', JSON.stringify([
    { id: 'u', role: 'user', text: 'Show work', ui: [], status: 'complete' },
    { id: 'a', role: 'aura', text: 'Partial', ui: [], status: 'streaming' },
  ]))
  vi.mocked(auraProvider.startConversation).mockResolvedValue('new-session')
  vi.mocked(auraProvider.sendMessage).mockImplementation(async (_s, _c, _m, h) => {
    h.onEvent({ type: 'message.start', messageId: 'retry' })
    h.onEvent({ type: 'text.delta', delta: 'Complete' })
    h.onComplete()
  })
  const { result } = renderHook(() => useAuraChat(space))
  expect(result.current.messages[1].status).toBe('error')
  await act(async () => { result.current.retryLastMessage() })
  expect(auraProvider.sendMessage).toHaveBeenCalledWith('space', 'new-session', 'Show work', expect.anything())
  expect(result.current.messages[1]).toMatchObject({ text: 'Complete', status: 'complete' })
  localStorage.clear()
  window.history.replaceState(window.history.state, '', '/')
})
