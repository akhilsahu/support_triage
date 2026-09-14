import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

import { yulloConfig } from '../../config/yullo'

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

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault()
    const el = document.querySelector(targetId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/85 backdrop-blur-xl border-b border-slate-200/80 shadow-md py-3'
          : 'bg-white/65 backdrop-blur-xl border-b border-slate-200/40 shadow-sm py-4'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 md:px-12">
        {/* Left: Brand Logo */}
        <Link to="/yullo" className="flex items-center gap-3 group">
          <img
            src={yulloConfig.assets.logo}
            alt="Yullo Logo"
            className="h-9 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
          />
          <span className="font-extrabold tracking-tight text-[#101828] text-lg">
            YULLO.CO
          </span>
        </Link>

        {/* Center: Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
          <a href="#network" onClick={e => handleNavClick(e, '#network')} className="transition-colors hover:text-[#101828]">
            Network
          </a>
          <a href="#aura" onClick={e => handleNavClick(e, '#aura')} className="transition-colors hover:text-[#101828]">
            Aura
          </a>
          <a href="#how-it-works" onClick={e => handleNavClick(e, '#how-it-works')} className="transition-colors hover:text-[#101828]">
            How it works
          </a>
          <a href="#businesses" onClick={e => handleNavClick(e, '#businesses')} className="transition-colors hover:text-[#101828]">
            For Businesses
          </a>
        </nav>

        {/* Right: Sign in & Prominent Dark Navy CTA */}
        <div className="flex items-center gap-4">
          <Link
            to="/app/login"
            className="text-sm font-medium text-slate-600 hover:text-[#101828] transition-colors hidden sm:block"
          >
            Sign in
          </Link>
          <a
            href="#claim"
            onClick={e => handleNavClick(e, '#claim')}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#101828] px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:bg-[#1e293b] hover:shadow-lg active:scale-[0.98]"
          >
            <span>Claim your Aura</span>
            <ArrowRight className="h-4 w-4 text-[#FFDA2D]" />
          </a>
        </div>
      </div>
    </header>
  )
}
