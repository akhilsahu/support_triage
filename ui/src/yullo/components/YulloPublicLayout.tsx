import { type ReactNode, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { YulloHeader } from './YulloHeader'
import { YulloFooter } from './YulloFooter'
import { yulloConfig } from '../config'
import '../styles/public.css'

export function YulloPublicLayout({ children }: { children: ReactNode }) {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
    else window.scrollTo(0, 0)
  }, [pathname, hash])

  return (
    <MotionConfig reducedMotion="user">
      <div className={`yullo-marketing min-h-screen bg-[#F9FBFF] text-[#101828] ${yulloConfig.typography.bodyClass} antialiased selection:bg-[#FFFC00] selection:text-[#101828] relative overflow-x-clip`}>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:p-3">Skip to content</a>
        <YulloHeader />
        {children}
        <YulloFooter />
      </div>
    </MotionConfig>
  )
}
