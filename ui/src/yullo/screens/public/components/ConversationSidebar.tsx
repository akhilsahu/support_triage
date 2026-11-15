import { PublicResources } from './PublicResources'
import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { MessageSquare, Plus, X } from 'lucide-react'
import type { ConversationHistoryItem } from '../../../services/aura/conversationCache'

interface ConversationSidebarProps {
  id: string
  spaceId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  history: ConversationHistoryItem[]
  conversationId: string | null
  isSending: boolean
  onSelect: (id: string) => void
  onNew: () => void
  accountName?: string
  signInHref?: string
  onSignOut?: () => void
  loading?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
  onRetry?: () => void
  error?: string
}

export function ConversationSidebar({ id, spaceId, open, onOpenChange, history, conversationId, isSending, onSelect, onNew, accountName, signInHref, onSignOut, loading, hasMore, onLoadMore, onRetry, error }: ConversationSidebarProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const reduceMotion = useReducedMotion()
  const transition = { duration: reduceMotion ? 0.12 : 0.22, ease: [0.32, 0.72, 0, 1] as const }
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
  }, [open])

  return (
    <dialog
      ref={dialog}
      id={id}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onClose={() => onOpenChange(false)}
      onCancel={event => {
        // Keep native focus containment until the exit animation finishes.
        event.preventDefault()
        onOpenChange(false)
      }}
      onClick={event => { if (event.target === event.currentTarget) onOpenChange(false) }}
      className="fixed inset-0 m-0 h-[100dvh] max-h-[100dvh] w-full max-w-none overflow-hidden border-0 bg-transparent p-0 text-[var(--presentation-text)] backdrop:bg-transparent"
    >
      <motion.div aria-hidden="true" className="absolute inset-0 bg-black/25 backdrop-blur-[2px]"
        initial={false} animate={{ opacity: open ? 1 : 0 }} transition={transition}
        onClick={() => onOpenChange(false)} />
      <motion.div
        initial={false}
        animate={{ opacity: open ? 1 : 0, transform: open || reduceMotion ? 'translateX(0%)' : 'translateX(-100%)' }}
        transition={transition}
        onAnimationComplete={() => {
          if (!open && dialog.current?.open) dialog.current.close()
        }}
        className="relative h-full w-[min(20rem,calc(100vw-2rem))] border-r border-[var(--presentation-border)] bg-[var(--presentation-canvas)] shadow-xl"
      >
      <div className="flex h-full flex-col pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">Explore & chat</h2>
          <button type="button" autoFocus onClick={() => onOpenChange(false)} aria-label="Close chat history"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-[var(--presentation-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--presentation-accent)]">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="px-4 pb-5">
          <button type="button" onClick={onNew} disabled={isSending}
            className="flex min-h-11 w-full items-center gap-3 rounded-[var(--presentation-radius)] border border-[var(--presentation-border)] bg-[var(--presentation-surface)] px-4 py-3 text-sm font-medium hover:border-[var(--presentation-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--presentation-accent)] disabled:cursor-wait disabled:opacity-50">
            <Plus size={18} aria-hidden="true" />New chat
          </button>
        </div>
        {spaceId && <PublicResources key={spaceId} spaceId={spaceId} open={open} portalContainer={dialog.current} />}
        <nav aria-label="Chat history" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
          <p className="px-3 pb-2 text-xs font-medium text-[var(--presentation-muted)]">Chat history</p>
          {history.length ? (
            <ul className="space-y-1">
              {history.map(item => (
                <li key={item.id}>
                  <button type="button" onClick={() => onSelect(item.id)} disabled={isSending}
                    aria-current={conversationId === item.id ? 'page' : undefined}
                    title={item.title}
                    className={`flex min-h-12 w-full items-start gap-3 rounded-lg border-l-2 px-3 py-3 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--presentation-accent)] disabled:cursor-wait disabled:opacity-50 ${conversationId === item.id
                      ? 'border-[var(--presentation-accent)] bg-[var(--presentation-accent-soft)] font-semibold'
                      : 'border-transparent hover:bg-[var(--presentation-surface)]'}`}>
                    <MessageSquare size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.title}</span>
                      {item.updatedAt && <time dateTime={new Date(item.updatedAt).toISOString()} className="mt-1 block text-xs font-normal text-[var(--presentation-muted)]">
                        {new Date(item.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </time>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : !loading && !error && <p className="px-3 py-6 text-sm leading-relaxed text-[var(--presentation-muted)]">Your chats will appear here after you send a message.</p>}
          {loading && <p role="status" className="px-3 py-4 text-sm text-[var(--presentation-muted)]">Loading saved chats…</p>}
          {hasMore && <button type="button" disabled={loading} onClick={onLoadMore} className="min-h-11 px-3 text-sm underline">More chats</button>}
          {error && <p role="status" className="px-3 py-3 text-sm text-[var(--presentation-muted)]">{error} <button type="button" disabled={loading || isSending} onClick={onRetry} className="underline disabled:opacity-50">Try again</button></p>}
        </nav>
        <div className="border-t border-[var(--presentation-border)] px-6 py-4 text-xs leading-relaxed text-[var(--presentation-muted)]">
          {isSending && <p role="status" className="mb-2">You can switch chats when the reply finishes.</p>}
          <p id={`${id}-description`}>{accountName ? 'Chats sync with your Yullo account. Drafts stay in this browser.' : 'Saved in this browser. Sign in to keep chats across devices.'}</p>
          {accountName ? <div className="mt-3 flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-[var(--presentation-text)]">{accountName}</span>
            <button type="button" onClick={onSignOut} disabled={isSending} className="min-h-11 shrink-0 underline disabled:opacity-50">Sign out</button>
          </div> : signInHref && <a href={signInHref} aria-disabled={isSending || undefined} onClick={event => { if (isSending) event.preventDefault() }}
            className={`mt-3 inline-flex min-h-11 items-center text-sm font-medium text-[var(--presentation-text)] underline ${isSending ? 'opacity-50' : ''}`}>Sign in to Yullo</a>}
        </div>
      </div>
      </motion.div>
    </dialog>
  )
}
