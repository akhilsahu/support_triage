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

let pending: Promise<void> | null = null

export function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (pending) return pending
  pending = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`)
    const script = existing || document.createElement('script')
    const finish = (error?: Error) => {
      window.clearTimeout(timer)
      script.removeEventListener('load', loaded)
      script.removeEventListener('error', failed)
      if (error) { script.remove(); reject(error) } else resolve()
    }
    const loaded = () => finish(window.google?.accounts?.id ? undefined : new Error('Google sign-in is unavailable.'))
    const failed = () => finish(new Error('Failed to load Google sign-in.'))
    const timer = window.setTimeout(failed, 15000)
    script.addEventListener('load', loaded)
    script.addEventListener('error', failed)
    if (!existing) {
      script.src = GIS_SRC
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
  }).catch(error => { pending = null; throw error })
  return pending
}
