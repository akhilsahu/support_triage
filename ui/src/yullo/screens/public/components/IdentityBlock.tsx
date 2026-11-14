import { SubspaceInfo } from '../../../forms/subspaces/SubspaceInfo'
import { motion } from 'motion/react'
import { PublicSpace } from '../../../services/aura/types'
import type { SpacePresentationConfig } from '../../appearance/presentation/schema'

export function IdentityBlock({ space, align = 'center', density = 'balanced', emphasis = 'balanced' }: { space: PublicSpace; align?: 'center' | 'start' | 'end'; density?: SpacePresentationConfig['visualDensity']; emphasis?: SpacePresentationConfig['landingEmphasis'] }) {
  const titleSize = density === 'expressive' ? 'text-[clamp(34px,5vw,56px)]' : density === 'minimal' ? 'text-[clamp(26px,3.5vw,38px)]' : 'text-[clamp(28px,4vw,44px)]'
  const isEnd = align === 'end'
  const isStart = align === 'start'
  return (
    <motion.div
      className={`flex max-w-2xl flex-col space-y-4 ${isStart ? 'items-start text-left' : isEnd ? 'items-end text-right' : 'items-center text-center'}`}
      style={{ scale: 'var(--presentation-hero-scale)', transformOrigin: isStart ? 'left center' : isEnd ? 'right center' : 'center' }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.3 }}
    >
      <div className="relative">
        <div className="absolute inset-0 scale-110 rounded-full bg-[var(--presentation-accent-soft)] blur-xl" />
        <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-[var(--presentation-border)] bg-[var(--presentation-accent-soft)] text-2xl font-bold text-[var(--presentation-accent-ink)]">
          {space.avatarUrl ? <img src={space.avatarUrl} alt="" className="h-full w-full object-cover" /> : space.displayName.charAt(0).toUpperCase()}
        </div>
      </div>

      <div className="space-y-1">
        <h1 className={`${titleSize} text-[var(--presentation-text)] ${emphasis === 'visual' ? 'max-w-[12ch]' : ''}`} style={{ fontFamily: 'var(--presentation-heading-font)', fontWeight: 'var(--presentation-heading-weight)', letterSpacing: 'var(--presentation-heading-tracking)' }}>{space.displayName}</h1>
        <p className={`${align === 'center' ? 'mx-auto' : isEnd ? 'ml-auto' : 'mr-auto'} max-w-xl text-[clamp(15px,2vw,18px)] leading-relaxed text-[var(--presentation-muted)]`}>
          {space.description}
        </p>
        {space.locationLabel && (
          <p className="mt-2 text-sm text-[var(--presentation-muted)]">
            {space.locationLabel}
          </p>
        )}
      </div>
      <SubspaceInfo fields={space.subspaceFields} />
      {!!space.bookingLinks?.length && (
        <div className={`flex w-full flex-wrap gap-3 ${isStart ? 'justify-start' : isEnd ? 'justify-end' : 'justify-center'}`}>
          {space.bookingLinks.map(link => {
            try {
              const url = new URL(link.url)
              if (url.protocol !== 'https:' || url.username || url.password || !link.label.trim()) return null
            } catch { return null }
            return <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex min-h-12 max-w-full items-center justify-center rounded-[var(--presentation-radius)] bg-[var(--presentation-accent)] px-5 py-3 text-base font-medium text-[var(--presentation-accent-contrast)] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--presentation-accent)] break-words">
              {link.label}<span aria-hidden="true" className="ml-2">↗</span>
            </a>
          })}
        </div>
      )}
    </motion.div>
  )
}
