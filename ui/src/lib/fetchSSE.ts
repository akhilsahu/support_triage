/**
 * fetchSSE — secure Server-Sent Events via fetch().
 *
 * The native EventSource API cannot send custom headers, so tokens end up in
 * the URL query string where they are logged by every proxy and web server.
 *
 * This utility uses fetch() instead, which supports Authorization headers,
 * and parses the text/event-stream protocol manually.
 *
 * Usage:
 *   const controller = new AbortController()
 *
 *   fetchSSE({
 *     url: '/api/v1/inbox/stream',
 *     headers: { Authorization: `Bearer ${token}` },
 *     onEvent: (type, data) => { ... },
 *     onError: (err) => { ... },
 *     signal: controller.signal,
 *   })
 *
 *   // To close:
 *   controller.abort()
 */

export interface FetchSSEOptions {
  url: string
  headers?: Record<string, string>
  onEvent: (eventType: string, data: string) => void
  onError?: (err: Error) => void
  signal?: AbortSignal
}

export async function fetchSSE({
  url,
  headers = {},
  onEvent,
  onError,
  signal,
}: FetchSSEOptions): Promise<void> {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/event-stream', ...headers },
      signal,
    })

    if (!response.ok) {
      throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`)
    }
    if (!response.body) {
      throw new Error('SSE response has no body')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      // Normalize CRLF / CR → LF. sse_starlette uses \r\n by default, so
      // splitting on the raw "\n\n" would never match "\r\n\r\n" and events
      // would silently pile up in the buffer, never reaching onEvent.
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n|\r/g, '\n')

      // SSE events are separated by a blank line (\n\n)
      const parts = buffer.split('\n\n')
      // Keep the last (possibly incomplete) chunk in the buffer
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        if (!part.trim()) continue

        let eventType = 'message'
        const dataLines: string[] = []

        for (const line of part.split('\n')) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            // Per spec a leading single space after the colon is stripped
            dataLines.push(line.slice(5).replace(/^ /, ''))
          }
          // id: and retry: fields are intentionally ignored
        }
        const data = dataLines.join('\n')

        if (eventType === 'ping') continue   // heartbeat — skip

        if (data) {
          onEvent(eventType, data)
        }
      }
    }
  } catch (err) {
    // AbortError means the caller closed the connection intentionally — not an error
    if (signal?.aborted) return
    if (err instanceof DOMException && err.name === 'AbortError') return
    onError?.(err instanceof Error ? err : new Error(String(err)))
  }
}
