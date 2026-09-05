import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { MotionConfig, useReducedMotion } from 'framer-motion'
import { Navbar } from './components/Navbar'
import { HeroSection } from './components/HeroSection'
import { ProofSection } from './components/ProofSection'
import { AnimatedBeamSection } from './components/AnimatedBeamSection'
import { OutcomeSections } from './components/OutcomeSections'
import { HowItWorksSection } from './components/HowItWorksSection'
import { IntegrationDetails } from './components/IntegrationDetails'
import { PricingSection } from './components/PricingSection'
import { FAQSection } from './components/FAQSection'
import { FinalCTABanner } from './components/FinalCTABanner'
import { Footer } from './components/Footer'
import { Pause, Play } from 'lucide-react'
import { trackLanding } from './analytics'
import './homepage5.css'

export function Homepage5() {
  const { hash, key } = useLocation()
  const reduced = useReducedMotion()
  const viewed = useRef(false)
  const [backgroundPaused, setBackgroundPaused] = useState(false)
  useEffect(() => {
    if (!viewed.current) {
      viewed.current = true
      trackLanding('landing_view')
    }
  }, [])
  useEffect(() => {
    if (!hash) return
    let id: string
    try {
      id = decodeURIComponent(hash.slice(1))
    } catch {
      return
    }
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(id)
      target?.scrollIntoView({
        behavior: reduced ? 'auto' : 'smooth',
        block: 'start',
      })
      target?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [hash, key, reduced])
  return (
    <MotionConfig reducedMotion="user">
      <div data-background-paused={backgroundPaused} className="h5-landing relative min-h-screen bg-[#FCFBF9] text-[#1C1C1C] font-sans antialiased selection:bg-[#E5E2DB] selection:text-[#1C1C1C] overflow-x-hidden">
        <div className="relative z-10">
          <a className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-white p-2 z-50" href="#main-content">
            Skip to content
          </a>
          <Navbar />
          <main id="main-content" tabIndex={-1}>
            <HeroSection />
          <ProofSection />
          <AnimatedBeamSection />
          <OutcomeSections />
          <HowItWorksSection />
          <IntegrationDetails />
          <PricingSection />
          <FAQSection />
          <FinalCTABanner />
          </main>
          <Footer />
          <button
            type="button"
            className="h5-motion-toggle"
            aria-pressed={backgroundPaused}
            aria-label="Pause background motion"
            onClick={() => setBackgroundPaused((paused) => !paused)}
          >
            {backgroundPaused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
            {backgroundPaused ? 'Motion paused' : 'Pause motion'}
          </button>
        </div>
      </div>
    </MotionConfig>
  )
}
