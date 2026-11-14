import { motion } from 'framer-motion'
import { useEffect, useRef } from 'react'

interface AuthTransitionProps {
  isNewUser: boolean
  returningToChat?: boolean
  onComplete: () => void
}

export function AuthTransition({ isNewUser, returningToChat = false, onComplete }: AuthTransitionProps) {
  const completion = useRef(onComplete)
  completion.current = onComplete
  useEffect(() => {
    const timer = window.setTimeout(() => completion.current(), 650)
    return () => window.clearTimeout(timer)
  }, [])
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center justify-center py-10 text-center"
    >
      {/* Yellow Node pulse reveal */}
      <motion.div
        initial={{ scale: 0.2, opacity: 0 }}
        animate={{ scale: [0.2, 1.2, 1], opacity: [0, 1, 1] }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-12 h-12 rounded-full bg-[#FFDA2D] flex items-center justify-center shadow-lg shadow-[#FFDA2D]/30 mb-4"
      >
        <svg className="w-6 h-6 text-[#0B1220]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
        </svg>
      </motion.div>

      <h3 className="text-xl font-bold text-[#0B1220] tracking-tight" style={{ fontFamily: 'Satoshi, sans-serif' }}>
        {isNewUser ? 'Welcome to Yullo' : 'Authenticated'}
      </h3>

      <p className="mt-1 text-sm text-slate-500 font-normal">
        {returningToChat ? 'Returning to your chat…' : isNewUser ? 'Preparing your onboarding space…' : 'Entering your space…'}
      </p>
    </motion.div>
  )
}
