import { afterEach, describe, expect, it, vi } from 'vitest'

import { HttpAuraProvider } from './HttpAuraProvider'

function streamResponse(chunks: string[]) {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)))
      controller.close()
    },
  }), { status: 200 })
}

describe('HttpAuraProvider stream', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('parses SSE events split across response chunks', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
      'data: {"type":"message.start","messageId":"m1"}\n\ndata: {"type":"text.',
      'delta","delta":"Hello"}\n\ndata: {"type":"message.done"}\n\n',
    ])))
    const events: string[] = []
    const onComplete = vi.fn()

    await new HttpAuraProvider('/api/v1').sendMessage('space', 'session', 'Hi', {
      onEvent: event => events.push(event.type),
      onError: vi.fn(),
      onComplete,
    })

    expect(events).toEqual(['message.start', 'text.delta', 'message.done'])
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('reports streamed errors without completing the response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
      'data: {"type":"error","message":"Session not found"}\n\n',
    ])))
    const onError = vi.fn()
    const onComplete = vi.fn()

    await new HttpAuraProvider('/api/v1').sendMessage('space', 'session', 'Hi', {
      onEvent: vi.fn(),
      onError,
      onComplete,
    })

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Session not found' }))
    expect(onComplete).not.toHaveBeenCalled()
  })
})

it.each([
  ['truncated', 'data: {"type":"message.start","messageId":"m1"}\n\ndata: {"type":"text.delta","delta":"Partial"}\n\n'],
  ['malformed', 'data: {"type":"message.start","messageId":"m1"}\n\ndata: broken\n\ndata: {"type":"message.done"}\n\n'],
  ['empty', 'data: {"type":"message.start","messageId":"m1"}\n\ndata: {"type":"message.done"}\n\n'],
])('rejects a %s response', async (_name, body) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([body])))
  const onError = vi.fn()
  const onComplete = vi.fn()
  await new HttpAuraProvider().sendMessage('space', 'session', 'Hi', { onEvent: vi.fn(), onError, onComplete })
  expect(onError).toHaveBeenCalledOnce()
  expect(onComplete).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

it.each([
  { type: 'ui.add', node: { type: 'actions', entityIds: 'invalid' } },
  { type: 'ui.add', node: { type: 'service' } },
  { type: 'ui.add', node: { type: 'unknown', entityId: 'id' } },
  { type: 'ui.add', node: { type: 'service', entityId: 'id', entity: { payload_json: {} } } },
  { type: 'citation.add', citation: null },
  { type: 'citation.add', citation: { id: 'ref', label: { invalid: true } } },
])('rejects malformed public response payloads: %j', async event => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
    `data: {"type":"message.start","messageId":"m1"}\n\ndata: ${JSON.stringify(event)}\n\ndata: {"type":"message.done"}\n\n`,
  ])))
  const onError = vi.fn()
  const onComplete = vi.fn()
  const onEvent = vi.fn()
  await new HttpAuraProvider().sendMessage('space', 'session', 'Hi', { onEvent, onError, onComplete })
  expect(onError).toHaveBeenCalledOnce()
  expect(onComplete).not.toHaveBeenCalled()
  expect(onEvent).toHaveBeenCalledTimes(1)
  vi.unstubAllGlobals()
})

it('completes a valid card-only response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
    'data: {"type":"message.start","messageId":"m1"}\n\ndata: {"type":"ui.add","node":{"type":"portfolio","entityId":"portfolio"}}\n\ndata: {"type":"message.done"}\n\n',
  ])))
  const onComplete = vi.fn()
  const onError = vi.fn()
  await new HttpAuraProvider().sendMessage('space', 'session', 'Show work', { onEvent: vi.fn(), onError, onComplete })
  expect(onComplete).toHaveBeenCalledOnce()
  expect(onError).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

it('accepts source-image IDs but not model-supplied image URLs', async () => {
  for (const [node, valid] of [
    [{ type: 'images', imageIds: ['a'.repeat(64)] }, true],
    [{ type: 'images', imageIds: ['https://invented.invalid/image.jpg'] }, false],
  ] as const) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
      `data: {"type":"message.start","messageId":"m1"}\n\ndata: ${JSON.stringify({ type: 'ui.add', node })}\n\ndata: {"type":"message.done"}\n\n`,
    ])))
    const onComplete = vi.fn(), onError = vi.fn()
    await new HttpAuraProvider().sendMessage('space', 'session', 'Show images', { onEvent: vi.fn(), onComplete, onError })
    expect(onComplete).toHaveBeenCalledTimes(valid ? 1 : 0)
    expect(onError).toHaveBeenCalledTimes(valid ? 0 : 1)
  }
  vi.unstubAllGlobals()
})
