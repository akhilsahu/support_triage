import { useEffect, useRef, useState } from 'react'
import { loginWithGoogle, type CustomerAuth } from '../../lib/customerAuth'

// "Continue with Google" gate shown in place of the chat input when a chatbot
// requires customer login (see app/models/chatbot.py login_after_messages).
// Renders Google Identity Services' own button — this runs on the first-party
// hosted chat page, so no FedCM/iframe workaround is needed.

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void }) => void
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void
        }
      }
    }
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client'

function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`)
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Failed to load Google sign-in.')))
    })
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = GIS_SRC; s.async = true; s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load Google sign-in.'))
    document.head.appendChild(s)
  })
}

export function CustomerLoginGate({
  slug, clientId, sessionId, botQuery, isDark, message, onSignedIn,
}: {
  slug: string
  clientId: string
  sessionId?: string
  botQuery?: string
  isDark: boolean
  message?: string
  onSignedIn: (auth: CustomerAuth) => void
}) {
  const btnRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadGis()
      .then(() => {
        if (cancelled || !btnRef.current || !window.google) return
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (resp: { credential: string }) => {
            setBusy(true); setError('')
            try {
              onSignedIn(await loginWithGoogle(slug, resp.credential, sessionId, botQuery || ''))
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Sign-in failed.')
            } finally {
              setBusy(false)
            }
          },
        })
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: isDark ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: 260,
        })
      })
      .catch(e => !cancelled && setError(e.message))
    return () => { cancelled = true }
  }, [clientId, slug, sessionId, botQuery, isDark, onSignedIn])

  return (
    <div className="flex flex-col items-center gap-2 py-1">
      <p className={`text-[13px] text-center ${isDark ? 'text-indigo-100/70' : 'text-slate-600'}`}>
        {message || 'Sign in to continue the conversation.'}
      </p>
      <div ref={btnRef} className={busy ? 'opacity-50 pointer-events-none' : ''} />
      <p className={`text-[11px] text-center max-w-xs ${isDark ? 'text-indigo-200/40' : 'text-slate-400'}`}>
        We use your Google account only to save your chat history so you can return to it later.
      </p>
      {error && <p className="text-[12px] text-red-400">{error}</p>}
    </div>
  )
}
