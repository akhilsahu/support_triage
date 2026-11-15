import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Grid3X3 } from 'lucide-react'

import { yulloConfig, yulloLandingPath } from '../config'

export function YulloHeader() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 40) {
        setScrolled(true)
      } else {
        setScrolled(false)
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/65 backdrop-blur-xl border-b border-slate-200/80 shadow-sm py-3'
          : 'bg-white/30 backdrop-blur-xl border-b border-slate-200/30 py-4'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 sm:px-6 lg:px-12">
        {/* Left: Brand Logo */}
        <Link to={yulloLandingPath()} aria-label="Yullo home" className="flex shrink-0 items-center gap-1.5 sm:gap-3 group">
          <img
            src={yulloConfig.assets.logo}
            alt="Yullo Logo"
            className="h-8 w-8 sm:h-10 sm:w-10 object-contain transition-transform duration-300 group-hover:scale-105"
          />
          <span className="font-black tracking-tight text-[#101828] text-sm sm:text-xl">
            YULLO.CO
          </span>
        </Link>

        {/* Center: Navigation Links */}
        <nav aria-label="Main navigation" className="hidden xl:flex items-center gap-6 text-sm font-medium text-slate-600">
          <a href={`${yulloLandingPath()}#network`} className="transition-colors hover:text-[#101828]">
            Network
          </a>
          <a href={`${yulloLandingPath()}#aura`} className="transition-colors hover:text-[#101828]">
            Aura
          </a>
          <a href={`${yulloLandingPath()}#how-it-works`} className="transition-colors hover:text-[#101828]">
            How it works
          </a>
          <a href={`${yulloLandingPath()}#businesses`} className="transition-colors hover:text-[#101828]">
            For Businesses
          </a>
        </nav>

        {/* Right: Sign in & Prominent Dark Navy CTA */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-4">
          <Link to="/yullo/explore" aria-label="Explore apps" className="inline-flex min-h-11 min-w-9 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100">
            <Grid3X3 className="h-4 w-4" aria-hidden="true" />
            <span className="hidden md:inline">Explore apps</span>
          </Link>
          <Link
            to="/yullo/auth"
            className="text-sm font-medium text-slate-600 hover:text-[#101828] transition-colors hidden sm:block"
          >
            Sign in
          </Link>
          <Link
            to="/yullo/auth?intent=claim"
            className="yullo-cta inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-2 text-xs sm:px-5 sm:text-sm font-semibold shadow-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
          >
            <span>Claim your Aura</span>
            <ArrowRight className="hidden h-4 w-4 sm:block" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  )
}
