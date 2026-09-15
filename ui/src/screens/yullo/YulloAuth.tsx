import { useNavigate } from 'react-router-dom'
import { yulloConfig } from '../../config/yullo'
import { AuthBrandPanel } from '../../components/yullo/auth/AuthBrandPanel'
import { AuthPanel } from '../../components/yullo/auth/AuthPanel'
import { AuthBrandNetwork } from '../../components/yullo/auth/AuthBrandNetwork'

export function YulloAuth() {
  const navigate = useNavigate()

  const handleAuthSuccess = (isNewUser: boolean) => {
    if (isNewUser) {
      navigate('/app/onboarding')
    } else {
      navigate('/app/dashboard')
    }
  }

  return (
    <div className="w-full min-h-[100dvh] bg-white flex flex-col lg:flex-row overflow-hidden selection:bg-[#FFDA2D] selection:text-[#0B1220]">
      {/* Desktop Brand Panel (Visible >= 960px / lg) */}
      <div className="hidden lg:flex lg:w-[57%] min-h-[100dvh]">
        <AuthBrandPanel />
      </div>

      {/* Mobile Top Brand Graphic (Visible < 960px / lg) */}
      <div className="lg:hidden relative w-full h-[140px] bg-[#F8FAFD] border-b border-slate-200/80 flex items-center justify-center overflow-hidden">
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

      {/* Auth Panel Container (Right side desktop, main area mobile) */}
      <div className="flex-1 min-h-[calc(100dvh-140px)] lg:min-h-[100dvh] flex">
        <AuthPanel onAuthSuccess={handleAuthSuccess} />
      </div>
    </div>
  )
}
