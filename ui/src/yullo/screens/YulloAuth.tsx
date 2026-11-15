import '../styles/auth.css'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { yulloConfig, yulloLandingPath } from '../config'
import { ArrowLeft } from 'lucide-react'
import { AuthBrandPanel } from '../components/auth/AuthBrandPanel'
import { AuthPanel } from '../components/auth/AuthPanel'
import { AuthBrandNetwork } from '../components/auth/AuthBrandNetwork'
import { yulloOnboardingApi } from '../api/onboarding'
import { isAxiosError } from 'axios'

function safeChatReturn(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  try {
    const url = new URL(value, window.location.origin)
    if (url.origin !== window.location.origin || url.pathname === '/yullo/auth') return null
    return url.pathname + url.search + url.hash
  } catch { return null }
}

export function YulloAuth() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const returnTo = params.get('intent') === 'chat' ? safeChatReturn(params.get('returnTo')) : null
  const claiming = params.get('intent') === 'claim'
  const handle = params.get('handle') || ''
  const claimDestination = '/yullo/spaces/new' + (/^[a-z0-9_-]{3,50}$/.test(handle) ? `?handle=${encodeURIComponent(handle)}` : '')
  const [isMobile, setIsMobile] = useState(() => !window.matchMedia('(min-width: 960px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 960px)')
    const update = () => setIsMobile(!media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const handleAuthSuccess = async (isNewUser: boolean) => {
    if (claiming) {
      try {
        // The new-Space screen resets drafts. Resume saved work before opening it.
        const draft = await yulloOnboardingApi.getDraft()
        navigate(`/yullo/spaces/${encodeURIComponent(draft.id)}/identity/edit`, { replace: true })
      } catch (error) {
        navigate(isAxiosError(error) && error.response?.status === 404 ? claimDestination : '/yullo/home', { replace: true })
      }
      return
    }
    navigate(returnTo || (isNewUser ? '/yullo/onboarding' : '/yullo/home'), { replace: true })
  }
  return (
    <div className="yullo-auth grid min-h-[100dvh] w-full grid-cols-1 bg-white selection:bg-[#FFDA2D] selection:text-[#0B1220] min-[960px]:grid-cols-[minmax(0,58fr)_minmax(420px,42fr)]">
      <div className="hidden min-[960px]:block"><AuthBrandPanel /></div>
      <main className="flex min-h-[100dvh] min-w-0 flex-col min-[960px]:border-l min-[960px]:border-slate-200">
        <div className="relative flex h-[140px] shrink-0 items-center justify-center overflow-hidden border-b border-slate-200/80 bg-[#FDFEFF] min-[960px]:hidden">
          <AuthBrandNetwork />
          <img src={yulloConfig.assets.logoTransparent} alt="Yullo" className="relative z-10 h-10 w-auto object-contain" />
        </div>
        <div className="flex flex-1 flex-col px-5 py-6 min-[960px]:px-10">
          <Link
            to={returnTo || yulloLandingPath()}
            className="mb-4 inline-flex min-h-11 self-start items-center gap-2 rounded-xl border border-black bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-on-solid)] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {returnTo ? 'Back to chat' : 'Back to Yullo'}
          </Link>
          <AuthPanel onAuthSuccess={handleAuthSuccess} isMobile={isMobile} returningToChat={Boolean(returnTo)} />
        </div>
      </main>
    </div>
  )
}
