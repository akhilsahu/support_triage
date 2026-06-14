import { useEffect } from 'react'
import { fetchSSE } from './fetchSSE'
import { useAppStore } from '../store/useAppStore'

/**
 * App-level inbox SSE connection.
 *
 * Mounted once in the Sidebar (always present while logged in) so that
 * unread notifications keep arriving even when the user is NOT on /inbox.
 *
 * It does two things on each event:
 *   1. Dispatches the raw event into the store (inboxEvent) so the Inbox
 *      screen — when mounted — can reload sessions / append to the open chat.
 *   2. Marks a session unread when a customer message arrives for a session
 *      that is not the one currently open on screen.
 *
 * Reads live state via useAppStore.getState() to avoid stale closures in the
 * long-lived reconnect loop.
 */
export function useInboxStream(token: string) {
  useEffect(() => {
    if (!token) return
    let cancelled = false
    let ctrl: AbortController | null = null

    const run = async () => {
      while (!cancelled) {
        ctrl = new AbortController()
        await fetchSSE({
          url: '/api/v1/inbox/stream',
          headers: { Authorization: `Bearer ${token}` },
          signal: ctrl.signal,
          onEvent: (type, data) => {
            const store = useAppStore.getState()
            store.dispatchInboxEvent(type, data)

            if (type === 'customer_message') {
              try {
                const d = JSON.parse(data)
                if (d.session_id && d.session_id !== store.activeInboxSessionId) {
                  store.addUnreadSession(d.session_id)
                }
              } catch { /* ignore malformed */ }
            }
          },
          onError: (err) => { if (!cancelled) console.error('[Inbox SSE]', err) },
        })
        if (!cancelled) await new Promise<void>(r => setTimeout(r, 2000))
      }
    }

    run()
    return () => { cancelled = true; ctrl?.abort() }
  }, [token])
}
