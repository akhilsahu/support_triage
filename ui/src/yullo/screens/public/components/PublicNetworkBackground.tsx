import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { SpacePresentationConfig } from '../../appearance/presentation/schema'

export function PublicNetworkBackground({ 
  state, 
  pulseKey 
  , intensity
}: { 
  state: 'empty' | 'conversation',
  pulseKey: number
  intensity: SpacePresentationConfig['networkIntensity']
}) {
  const [pulses, setPulses] = useState<number[]>([])

  // Trigger a subtle pulse animation when pulseKey changes
  useEffect(() => {
    if (pulseKey > 0) {
      setPulses(prev => [...prev, pulseKey])
      // Remove pulse after animation completes (1.5s)
      const timer = setTimeout(() => {
        setPulses(prev => prev.filter(k => k !== pulseKey))
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [pulseKey])

  // Restrained network styling
  // Empty state: opacity 0.2
  // Conversation: opacity 0.05
  const intensityOpacity = intensity === 'none' ? 0 : intensity === 'very_low' ? 0.08 : 0.16
  const baseOpacity = state === 'empty' ? intensityOpacity : intensityOpacity * 0.35

  return (
    <motion.div 
      className="absolute inset-0 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: baseOpacity }}
      transition={{ duration: 0.8 }}
    >
      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="node-glow-cyan" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#00E5FF" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="node-glow-yellow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFC00" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#FFFC00" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Marginal static lines - architectural, asymmetrical */}
        <g stroke="#9CA3AF" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.3">
          <path d="M 0 100 L 250 100 L 400 -50" stroke="var(--presentation-accent)" />
          <path d="M 1000 800 L 800 800 L 900 1200" />
          <path d="M 800 0 L 800 150 L 1200 250" />
        </g>

        {/* Static anchor nodes */}
        <g fill="#D1D5DB">
          <circle cx="250" cy="100" r="2" />
          <circle cx="800" cy="800" r="2" />
          <circle cx="800" cy="150" r="2" />
        </g>

        {/* Pulse Animations */}
        <AnimatePresence>
          {pulses.map((key) => (
            <motion.g key={key}>
              <motion.circle 
                cx="250" cy="100" r="6" 
                fill="url(#node-glow-cyan)"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: [0, 1, 0], scale: [0.5, 1.5, 0.5] }}
                transition={{ duration: 1.2, ease: "easeInOut" }}
              />
              <motion.path 
                d="M 0 100 L 250 100" 
                stroke="#00E5FF" 
                strokeWidth="1.5"
                fill="none"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: [0, 0.6, 0] }}
                transition={{ duration: 1.2, ease: "easeOut" }}
              />
            </motion.g>
          ))}
        </AnimatePresence>
      </svg>
    </motion.div>
  )
}
