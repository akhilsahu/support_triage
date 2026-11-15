import { Share, UserRound } from 'lucide-react'
import { PublicSpace } from '../../../services/aura/types'
import { AnimatePresence, motion } from 'framer-motion'

export function PublicHeader({ space, identityVisible, historyOpen, historyId, onHistoryToggle, signInHref, accountName, busy }: {
  space: PublicSpace | null
  identityVisible?: boolean
  historyOpen?: boolean
  historyId?: string
  onHistoryToggle?: () => void
  signInHref?: string
  accountName?: string
  busy?: boolean
}) {
  if (!space) return null

  return (
    <motion.header 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between px-6 py-4 bg-[color:var(--presentation-surface)]/90 backdrop-blur-sm border-b border-[var(--presentation-border)] sticky top-0 z-50 flex-shrink-0"
    >
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onHistoryToggle} disabled={!onHistoryToggle}
          aria-label={`Open resources and chats for ${space.displayName}`}
          aria-expanded={onHistoryToggle ? historyOpen : undefined}
          aria-controls={historyId}
          aria-haspopup={onHistoryToggle ? 'dialog' : undefined}
          className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--presentation-border)] bg-[var(--presentation-accent-soft)] font-bold text-[var(--presentation-text)] enabled:hover:border-[var(--presentation-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--presentation-accent)]">
          {space.avatarUrl ? <img src={space.avatarUrl} alt="" className="h-full w-full object-cover" /> : space.displayName.charAt(0).toUpperCase()}
        </button>
        <div className="relative flex h-10 min-w-0 items-center">
        <AnimatePresence mode="wait">
          {!identityVisible ? (
            <motion.div 
              key="compact-identity"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex min-w-0 items-center"
            >
              <div className="truncate font-semibold text-[var(--presentation-text)] leading-tight tracking-tight">
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
              className="font-bold tracking-widest text-sm text-[var(--presentation-text)]"
            >
              YULLO
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </div>

      <div className="ml-3 flex shrink-0 items-center gap-4 text-[var(--presentation-muted)]">
        {accountName ? <button type="button" onClick={onHistoryToggle} aria-label={`Open resources, chats and account for ${accountName}`}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--presentation-border)] bg-[var(--presentation-surface)] text-[var(--presentation-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--presentation-accent)]">
          <UserRound size={18} aria-hidden="true" />
        </button> : signInHref && <a href={signInHref} aria-disabled={busy || undefined} onClick={event => { if (busy) event.preventDefault() }}
          className={`flex min-h-11 items-center rounded-full border border-[var(--presentation-border)] bg-[var(--presentation-surface)] px-4 text-sm font-medium text-[var(--presentation-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--presentation-accent)] ${busy ? 'opacity-50' : ''}`}>Sign in</a>}
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
