import { Share } from 'lucide-react'
import { PublicSpace } from '../../../services/aura/types'
import { AnimatePresence, motion } from 'framer-motion'

export function PublicHeader({ space, identityVisible }: { space: PublicSpace | null, identityVisible?: boolean }) {
  if (!space) return null

  return (
    <motion.header 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between px-6 py-4 bg-[color:var(--presentation-surface)]/90 backdrop-blur-sm border-b border-[var(--presentation-border)] sticky top-0 z-50 flex-shrink-0"
    >
      <div className="relative h-10 flex items-center min-w-[200px]">
        <AnimatePresence mode="wait">
          {!identityVisible ? (
            <motion.div 
              key="compact-identity"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute left-0 flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-full bg-[var(--presentation-accent)] flex items-center justify-center text-[var(--presentation-accent-ink)] font-bold shadow-sm ring-2 ring-[var(--presentation-surface)]">
                {space.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="font-semibold text-[var(--presentation-text)] leading-tight tracking-tight whitespace-nowrap">
                {space.displayName}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="yullo-brand"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute left-0 font-bold tracking-widest text-sm text-[var(--presentation-text)]"
            >
              YULLO
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-4 text-[var(--presentation-muted)]">
        <button className="text-sm font-medium transition-opacity flex items-center gap-1.5 text-[var(--presentation-text)] hover:opacity-70" aria-label="Share this Space">
          <Share className="w-4 h-4" />
          <span className="hidden sm:inline">Share</span>
        </button>
        <button className="transition-opacity text-[var(--presentation-muted)] hover:opacity-70" aria-label="More options">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
            <circle cx="5" cy="12" r="1" />
          </svg>
        </button>
      </div>
    </motion.header>
  )
}
