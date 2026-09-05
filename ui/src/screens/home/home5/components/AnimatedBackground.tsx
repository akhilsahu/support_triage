import { useEffect, useRef, useState } from 'react'
import { useInView } from 'framer-motion'

/** Decorative layers animate only while their section and browser tab are visible. */
export function AnimatedBackground({ variant = 'hero' }: { variant?: 'hero' | 'cta' }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref)
  const [tabVisible, setTabVisible] = useState(() => !document.hidden)

  useEffect(() => {
    const updateVisibility = () => setTabVisible(!document.hidden)
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  return (
    <div
      ref={ref}
      className={`h5-atmosphere h5-atmosphere--${variant}`}
      data-active={inView && tabVisible}
      aria-hidden="true"
    >
      <div className="h5-light h5-light--sage" />
      <div className="h5-light h5-light--gold" />
      <div className="h5-grid" />
      {variant === 'hero' && (
        <div className="h5-geometry">
          <div className="h5-geometry-floor" />
          <div className="h5-shape h5-shape--cube">
            <svg viewBox="0 0 220 240" fill="none">
              <path d="M110 22 202 75 110 128 18 75Z" fill="#A9BDA0" />
              <path d="M18 75 110 128V234L18 181Z" fill="#526B54" />
              <path d="M110 128 202 75V181L110 234Z" fill="#789478" />
              <g stroke="#FCFBF9" strokeOpacity=".55">
                <path d="M49 57 141 110V216M80 40 172 93V198M49 93 141 40M80 110 172 57" />
                <path d="M18 110 110 163 202 110M18 146 110 199 202 146M49 93V199M80 110V217" />
              </g>
              <path d="M110 22 202 75V181L110 234 18 181V75Z" stroke="#405B43" strokeOpacity=".35" />
            </svg>
          </div>
          <div className="h5-shape h5-shape--sphere">
            <svg className="h5-wire-sphere" viewBox="0 0 300 300" fill="none" stroke="currentColor" strokeWidth="1.1">
              <circle cx="150" cy="150" r="130" fill="#E0E8D8" fillOpacity=".65" />
              {Array.from({ length: 12 }, (_, i) => (
                <ellipse key={i} cx="150" cy="150" rx="130" ry="42" transform={`rotate(${i * 15} 150 150)`} />
              ))}
              <circle cx="150" cy="150" r="130" strokeWidth="2" />
            </svg>
          </div>
          <div className="h5-shape h5-shape--star">
            <svg viewBox="0 0 160 160" fill="none">
              <path d="m80 8 15 46 43-23-23 43 37 15-46 15 23 43-43-23-15 28-15-46-43 23 23-43L8 71l46-15-23-43 43 23Z" fill="#D4AC70" stroke="#AB8048" strokeWidth="1.5" />
              <path d="m80 42 8 30 30 8-30 8-8 30-8-30-30-8 30-8Z" fill="#F4DEB6" />
            </svg>
          </div>
          <div className="h5-shape h5-shape--tiles">
            <svg viewBox="0 0 190 180" fill="none" stroke="#789478" strokeWidth="1.5">
              <rect x="39" y="39" width="115" height="115" rx="24" transform="rotate(-18 96 96)" fill="#DAE3D4" />
              <rect x="25" y="22" width="115" height="115" rx="24" transform="rotate(-18 82 80)" fill="#FCFBF9" />
              <path d="M53 62h51v32H79l-15 13V94H53Z" stroke="#526B54" strokeWidth="3" strokeLinejoin="round" />
              <path d="M65 73h27M65 83h16" stroke="#526B54" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
          <span className="h5-cross h5-cross--one">+</span>
          <span className="h5-cross h5-cross--two">+</span>
          <span className="h5-cross h5-cross--three">+</span>
        </div>
      )}
      <div className="h5-orbit h5-orbit--outer"><span /></div>
      <div className="h5-orbit h5-orbit--inner"><span /></div>
      <div className="h5-specks">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} style={{
            left: `${5 + ((i * 29) % 90)}%`,
            top: `${12 + ((i * 17) % 72)}%`,
            animationDelay: `${-i * 1.7}s`,
            animationDuration: `${12 + (i % 4) * 3}s`,
          }} />
        ))}
      </div>
    </div>
  )
}
