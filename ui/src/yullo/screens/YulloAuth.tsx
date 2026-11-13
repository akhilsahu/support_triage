import '../styles/auth.css'
import { useNavigate } from 'react-router-dom'
import { yulloConfig } from '../config'
import { AuthBrandPanel } from '../components/auth/AuthBrandPanel'
import { AuthPanel } from '../components/auth/AuthPanel'
import { AuthBrandNetwork } from '../components/auth/AuthBrandNetwork'

export function YulloAuth() {
  const navigate = useNavigate()

  const handleAuthSuccess = (isNewUser: boolean) => {
    if (isNewUser) {
      navigate('/yullo/onboarding')
    } else {
      navigate('/yullo/home')
    }
  }

  return (
    <div className="yullo-auth w-full min-h-[100dvh] bg-white selection:bg-[#FFDA2D] selection:text-[#0B1220]">
      {/* Desktop Layout (>= 960px): CSS Grid 58fr : 42fr */}
      <div className="hidden min-[960px]:grid min-[960px]:grid-cols-[minmax(0,58fr)_minmax(420px,42fr)] min-h-[100dvh] w-full overflow-hidden">
        <AuthBrandPanel />
        <AuthPanel onAuthSuccess={handleAuthSuccess} />
      </div>

      {/* Mobile Layout (< 960px): Standard document flow */}
      <div className="min-[960px]:hidden flex flex-col min-h-[100dvh] w-full">
        {/* Mobile Compact Header (120-160px height) */}
        <div className="relative w-full h-[140px] bg-[#F8FAFD] border-b border-slate-200/80 flex items-center justify-center shrink-0 overflow-hidden">
          <AuthBrandNetwork />
          <div className="relative z-10">
            <img
              src={yulloConfig.assets.logoTransparent}
              alt="Yullo Brand Logo"
              className="h-10 w-auto object-contain"
              style={{
                filter: 'drop-shadow(0 6px 20px rgba(255, 218, 45, 0.14))',
              }}
            />
          </div>
        </div>

        {/* Mobile Auth Form Container */}
        <div className="flex-1 flex flex-col px-5 py-6">
          <AuthPanel onAuthSuccess={handleAuthSuccess} isMobile />
        </div>
      </div>
    </div>
  )
}
