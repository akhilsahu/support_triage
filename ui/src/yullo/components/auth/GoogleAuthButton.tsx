import { useEffect, useRef, useState } from 'react'
import { loadGoogleIdentity } from '../../../lib/googleIdentity'
import { yulloApiClient } from '../../api/client'

interface GoogleAuthButtonProps {
  onSuccess: (data: { id_token: string }) => void
  onError: (message: string) => void
  loading?: boolean
}

export function GoogleAuthButton({ onSuccess, onError, loading }: GoogleAuthButtonProps) {
  const button = useRef<HTMLDivElement>(null)
  const handlers = useRef({ onSuccess, onError, loading })
  handlers.current = { onSuccess, onError, loading }
  const [status, setStatus] = useState('Loading Google sign-in…')
  useEffect(() => {
    let active = true
    let observer: ResizeObserver | undefined
    void (async () => {
      try {
        const { data } = await yulloApiClient.get<{ googleClientId: string | null }>('/auth/providers')
        if (!data.googleClientId) { if (active) setStatus('Use email or phone to continue.'); return }
        await loadGoogleIdentity()
        if (!active || !button.current || !window.google) return
        window.google.accounts.id.initialize({ client_id: data.googleClientId, callback: response => {
          if (active && !handlers.current.loading) handlers.current.onSuccess({ id_token: response.credential })
        } })
        let renderedWidth = 0
        const render = () => {
          if (!active || !button.current || !window.google) return
          const width = Math.min(400, Math.floor(button.current.clientWidth))
          if (width <= 0 || width === renderedWidth) return
          renderedWidth = width
          button.current.replaceChildren()
          window.google.accounts.id.renderButton(button.current, {
            theme: 'outline', size: 'large', shape: 'rectangular', text: 'continue_with', width,
          })
          setStatus('')
        }
        render()
        observer = new ResizeObserver(render)
        observer.observe(button.current)
      } catch { if (active) setStatus('Google sign-in is unavailable. Use email or phone.') }
    })()
    return () => { active = false; observer?.disconnect() }
  }, [])
  return <div className="w-full min-w-0" aria-busy={loading || undefined}>
    <div ref={button} className={`w-full min-w-0 ${loading ? 'pointer-events-none opacity-50' : ''}`}  />
    {status && <p role="status" className="py-3 text-center text-sm text-slate-500">{status}</p>}
  </div>
}
