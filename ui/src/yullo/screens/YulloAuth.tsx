import '../styles/auth.css'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { yulloConfig } from '../config'
import { AuthBrandPanel } from '../components/auth/AuthBrandPanel'
import { AuthPanel } from '../components/auth/AuthPanel'
import { AuthBrandNetwork } from '../components/auth/AuthBrandNetwork'

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
  const [isMobile, setIsMobile] = useState(() => !window.matchMedia('(min-width: 960px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 960px)')
    const update = () => setIsMobile(!media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const handleAuthSuccess = (isNewUser: boolean) => {
    navigate(returnTo || (isNewUser ? '/yullo/onboarding' : '/yullo/home'), { replace: true })
  }
  return (
    <div className="yullo-auth grid min-h-[100dvh] w-full grid-cols-1 bg-white selection:bg-[#FFDA2D] selection:text-[#0B1220] min-[960px]:grid-cols-[minmax(0,58fr)_minmax(420px,42fr)]">
      <div className="hidden min-[960px]:block"><AuthBrandPanel /></div>
      <main className="flex min-h-[100dvh] min-w-0 flex-col min-[960px]:border-l min-[960px]:border-slate-200">
        <div className="relative flex h-[140px] shrink-0 items-center justify-center overflow-hidden border-b border-slate-200/80 bg-[#F8FAFD] min-[960px]:hidden">
          <AuthBrandNetwork />
          <img src={yulloConfig.assets.logoTransparent} alt="Yullo" className="relative z-10 h-10 w-auto object-contain" />
        </div>
        <div className="flex flex-1 flex-col px-5 py-6 min-[960px]:px-10">
          {returnTo && <Link to={returnTo} className="mb-4 self-start text-sm text-slate-600 underline">Back to chat</Link>}
          <AuthPanel onAuthSuccess={handleAuthSuccess} isMobile={isMobile} returningToChat={Boolean(returnTo)} />
        </div>
      </main>
    </div>
  )
}
