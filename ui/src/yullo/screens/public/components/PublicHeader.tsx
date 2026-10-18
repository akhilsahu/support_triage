import { Share } from 'lucide-react'
import { PublicSpace } from '../../../services/aura/types'
import { AnimatePresence, motion } from 'framer-motion'

export function PublicHeader({ space, identityVisible }: { space: PublicSpace | null, identityVisible?: boolean }) {
  if (!space) return null

  return (
    <motion.header 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between px-6 py-4 bg-[rgba(248,249,250,0.94)] backdrop-blur-sm border-b border-[rgba(22,28,39,0.06)] sticky top-0 z-50 flex-shrink-0"
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
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#FFFC00] to-[#FFFC00]/50 flex items-center justify-center text-black font-bold shadow-sm ring-2 ring-white">
                {space.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="font-semibold text-gray-900 leading-tight tracking-tight whitespace-nowrap">
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
              className="absolute left-0 font-bold tracking-widest text-sm text-gray-900"
            >
              YULLO
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-4 text-gray-500">
        <button className="text-sm font-medium hover:text-gray-900 transition-colors flex items-center gap-1.5 bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90">
          <Share className="w-4 h-4" />
          <span className="hidden sm:inline">Share</span>
        </button>
        <button className="text-gray-400 hover:text-gray-900 transition-colors bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90">
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
