import { motion, useReducedMotion } from 'motion/react'
import { ReactNode } from 'react'

export function PreviewSection({
  type,
  source,
  index,
  children
}: {
  type: string
  source: 'example' | 'grounded'
  index: number
  children: ReactNode
}) {
  const isGenerated = source === 'grounded'
  const prefersReducedMotion = useReducedMotion()

  const staggerDelay = prefersReducedMotion ? 0 : Math.min(index * 0.07, 0.28)
  
  return (
    <motion.section
      layout="position"
      layoutId={type}
      initial={isGenerated ? { opacity: 0, y: prefersReducedMotion ? 0 : 8 } : false}
      animate={{
        opacity: 1,
        y: 0,
        backgroundColor: isGenerated ? ['var(--presentation-accent-soft)', 'transparent'] : 'transparent'
      }}
      transition={{
        opacity: { duration: prefersReducedMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1], delay: staggerDelay },
        y: { duration: prefersReducedMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1], delay: staggerDelay },
        backgroundColor: { duration: prefersReducedMotion ? 0 : 0.65, ease: 'easeOut', delay: staggerDelay },
        layout: { duration: 0.28, ease: 'easeInOut' }
      }}
      className={`preview-section-wrapper ${isGenerated ? 'is-generated' : ''} relative w-full rounded-2xl`}
    >
      {isGenerated && !prefersReducedMotion && (
        <motion.div 
          className="absolute top-0 left-0 h-[1px] bg-[var(--presentation-accent)]"
          initial={{ width: '0%', opacity: 1 }}
          animate={{ width: '100%', opacity: 0 }}
          transition={{
            width: { duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: staggerDelay },
            opacity: { duration: 0.2, delay: staggerDelay + 0.2 }
          }}
        />
      )}
      {children}
    </motion.section>
  )
}
