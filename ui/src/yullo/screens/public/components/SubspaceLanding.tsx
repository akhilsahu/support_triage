import { useState } from 'react'
import { ArrowUpRight, CalendarDays, Clock3, MapPin } from 'lucide-react'
import type { PublicSpace } from '../../../services/aura/types'
import { SubspaceInfo } from '../../../forms/subspaces/SubspaceInfo'
import type { SpacePresentationConfig } from '../../appearance/presentation/schema'
import { LocationMapPreview } from '../../../forms/LocationMapPreview'
import { useSectionEditor } from '../../appearance/preview/SectionEditorContext'

function secureUrl(value?: string | null) {
  try {
    const url = new URL(value || '')
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined
  } catch { return undefined }
}

export function subspacePrompts(space: PublicSpace): string[] {
  if (space.promptStarters?.length) return space.promptStarters
  const type = space.pageDetails?.spaceType
  return type === 'event' ? ['Tell me about this event', 'What should I know before attending?']
    : type === 'service' ? ['What does this service include?', 'How can I get started?']
    : ['Tell me more', 'What are the key details?']
}

export function SubspaceLanding({ space, presentation, artworkUrl, artworkAlt = '' }: { space: PublicSpace; presentation: SpacePresentationConfig; artworkUrl?: string; artworkAlt?: string }) {
  const editor = useSectionEditor()
  const [expanded, setExpanded] = useState(false)
  const [failedImage, setFailedImage] = useState<string>()
  const publicDetails = space.pageDetails
  const ownerDetails = editor?.pageDetailsPreview
  const venue = publicDetails?.locationLabel ? publicDetails : ownerDetails || publicDetails
  const details = {
    ...publicDetails,
    startsAt: publicDetails?.startsAt ?? ownerDetails?.startsAt,
    endsAt: publicDetails?.endsAt ?? ownerDetails?.endsAt,
    locationLabel: venue?.locationLabel,
    locationUrl: venue?.locationUrl,
    latitude: venue?.latitude,
    longitude: venue?.longitude,
    isRemote: venue?.isRemote,
  }
  const privateStart = !publicDetails?.startsAt && Boolean(ownerDetails?.startsAt)
  const privateEnd = !publicDetails?.endsAt && Boolean(ownerDetails?.endsAt)
  const privateVenue = !publicDetails?.locationLabel && Boolean(ownerDetails?.locationLabel)
  const type = details.spaceType || 'other'
  const label = details?.typeLabel || (type === 'posting' ? 'Post' : type === 'other' ? 'Details' : type.charAt(0).toUpperCase() + type.slice(1))
  const description = space.description.trim()
  const summary = description.length > 220 ? `${description.slice(0, 200).trimEnd()}…` : description
  const longDescription = description.length > 1200
  const shownDescription = longDescription && !expanded ? `${description.slice(0, 1150).trimEnd()}…` : description
  const rawStart = details?.startsAt
  const start = rawStart ? new Date(rawStart) : null
  const validStart = start && !Number.isNaN(start.getTime()) ? start : null
  const end = details.endsAt ? new Date(details.endsAt) : null
  const validEnd = end && !Number.isNaN(end.getTime()) ? end : null
  const publicActions = (space.bookingLinks || []).map(link => ({ ...link, visibleOnPage: true }))
  const publicIds = new Set(publicActions.map(link => link.id))
  const actions = [...publicActions, ...(editor?.bookingPreview || []).filter(link => !publicIds.has(link.id))]
    .filter(link => secureUrl(link.url) && link.label.trim())
  const [primary, ...otherActions] = actions
  const locationUrl = secureUrl(details?.locationUrl)
  const hasArtwork = artworkUrl && artworkUrl !== failedImage
  const hasDetails = Boolean(validStart || validEnd || details?.locationLabel || space.subspaceFields?.price_amount != null || space.subspaceFields?.details.length)
  const panelHasContent = hasDetails || Boolean(primary)
  const split = presentation.hero.layout === 'image_left' || presentation.hero.layout === 'image_right'
  const imageRight = presentation.hero.layout === 'image_right'
  const compact = presentation.visualDensity === 'minimal'
  const alignment = presentation.contentLayout === 'center' ? 'text-center' : presentation.contentLayout === 'right' ? 'text-right' : 'text-left'

  return <article className={`w-full rounded-[var(--presentation-radius)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--presentation-artwork-accent,var(--presentation-accent))_18%,var(--presentation-canvas))_0%,var(--presentation-canvas)_65%)] ${compact ? 'space-y-5 p-4 sm:p-5' : 'space-y-7 p-5 sm:p-7'}`}>
    <header className={`space-y-3 ${alignment}`}>
      <span className="inline-flex rounded-full bg-[var(--presentation-accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--presentation-accent-ink)]">{label}</span>
      <h1 className="break-words text-[clamp(30px,4.5vw,48px)] leading-tight" style={{ fontFamily: 'var(--presentation-heading-font)', fontWeight: 'var(--presentation-heading-weight)', letterSpacing: 'var(--presentation-heading-tracking)' }}>{space.displayName}</h1>
      {summary && <p className="text-base leading-relaxed text-[var(--presentation-text)]">{summary}</p>}
    </header>

    {(hasArtwork || panelHasContent) && <div className={`grid items-start gap-6 ${hasArtwork && panelHasContent && split ? imageRight ? 'min-[800px]:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.3fr)]' : 'min-[800px]:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.8fr)]' : ''}`}>
      {hasArtwork && <figure className={`flex min-w-0 justify-center min-[800px]:justify-start ${imageRight ? 'min-[800px]:order-2' : ''}`}>
        <img src={artworkUrl} alt={artworkAlt || `${space.displayName} artwork`} onError={() => setFailedImage(artworkUrl)} className={`${compact ? 'max-h-[280px]' : presentation.visualDensity === 'expressive' ? 'max-h-[560px]' : 'max-h-[460px]'} w-auto max-w-full rounded-[var(--presentation-radius)] object-contain`} />
      </figure>}
      {!!panelHasContent && <aside aria-label={`${label} details`} className={`space-y-5 rounded-[var(--presentation-radius)] border border-[var(--presentation-border)] bg-[color-mix(in_srgb,var(--presentation-accent)_8%,var(--presentation-surface))] p-5 text-left sm:p-6 ${imageRight ? 'min-[800px]:order-1' : ''}`}>
        <h2 className="text-base font-semibold">{label} details</h2>
        {(privateStart || privateEnd || privateVenue) && <p className="rounded-lg border border-[var(--presentation-border)] bg-[var(--presentation-surface)] px-3 py-2 text-xs leading-relaxed text-[var(--presentation-muted)]">Studio preview only · Details marked private stay hidden from visitors.</p>}
        {(validStart || validEnd || details?.locationLabel) && <dl className="grid gap-5 text-sm min-[420px]:grid-cols-2">
          {validStart && <>
            <div className="flex gap-3"><CalendarDays size={19} className="shrink-0 text-[var(--presentation-accent-ink)]" aria-hidden="true" /><div><dt className="text-xs text-[var(--presentation-muted)]">Date{privateStart && <span className="ml-2 text-[10px]">Private</span>}</dt><dd className="mt-1 font-medium">{validStart.toLocaleDateString(undefined, { dateStyle: 'long' })}</dd></div></div>
            <div className="flex gap-3"><Clock3 size={19} className="shrink-0 text-[var(--presentation-accent-ink)]" aria-hidden="true" /><div><dt className="text-xs text-[var(--presentation-muted)]">Start time{privateStart && <span className="ml-2 text-[10px]">Private</span>}</dt><dd className="mt-1 font-medium">{validStart.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' })}</dd></div></div>
          </>}
          {validEnd && <div className="flex gap-3 min-[420px]:col-span-2"><Clock3 size={19} className="shrink-0 text-[var(--presentation-accent-ink)]" aria-hidden="true" /><div><dt className="text-xs text-[var(--presentation-muted)]">Ends{privateEnd && <span className="ml-2 text-[10px]">Private</span>}</dt><dd className="mt-1 font-medium">{validEnd.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' })}</dd></div></div>}
          {details?.locationLabel && <div className="flex gap-3 min-[420px]:col-span-2"><MapPin size={19} className="shrink-0 text-[var(--presentation-accent-ink)]" aria-hidden="true" /><div className="min-w-0"><dt className="text-xs text-[var(--presentation-muted)]">Location{privateVenue && <span className="ml-2 text-[10px]">Private</span>}</dt><dd className="mt-1 break-words font-medium">{locationUrl ? <a href={locationUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{details.locationLabel}</a> : details.locationLabel}</dd></div></div>}
        </dl>}
        {details?.locationLabel && !details.isRemote && <LocationMapPreview name={`${space.displayName} location`} address={details.locationLabel} latitude={details.latitude} longitude={details.longitude} />}
        {space.subspaceFields?.price_amount != null && <p className="text-xs font-medium text-[var(--presentation-muted)]">Price</p>}
        <SubspaceInfo fields={space.subspaceFields} />
        {primary && <div className={`space-y-2 ${hasDetails ? 'border-t border-[var(--presentation-border)] pt-4' : ''}`}>
          <a href={primary.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 w-fit max-w-full items-center justify-center gap-2 rounded-lg border border-[var(--presentation-accent-ink)] bg-[var(--presentation-accent)] px-4 py-2.5 text-center text-sm font-semibold text-[var(--presentation-accent-contrast)] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--presentation-accent)]"><span className="min-w-0 break-words">{primary.label}</span><ArrowUpRight size={16} className="shrink-0" aria-hidden="true" /></a>
          {!primary.visibleOnPage && <p className="text-xs leading-relaxed text-[var(--presentation-muted)]">Studio preview only · Hidden from visitors</p>}
        </div>}
        {!!otherActions.length && <div className="flex flex-wrap gap-4 text-sm">{otherActions.map(link => <div key={link.id}><a href={link.url} target="_blank" rel="noopener noreferrer" className="text-[var(--presentation-accent-ink)] underline underline-offset-4">{link.label}</a>{!link.visibleOnPage && <p className="mt-1 text-xs text-[var(--presentation-muted)]">Studio preview only</p>}</div>)}</div>}
      </aside>}
    </div>}

    {description.length > summary.length && <section className="max-w-3xl space-y-3">
      <h2 className="text-xl font-semibold">About {type === 'event' ? 'this event' : type === 'service' ? 'this service' : 'this page'}</h2>
      <p className="whitespace-pre-wrap text-base leading-relaxed text-[var(--presentation-text)]">{shownDescription}</p>
      {longDescription && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="min-h-11 text-sm font-semibold text-[var(--presentation-accent-ink)] underline underline-offset-4">{expanded ? 'Show less' : 'Read more'}</button>}
    </section>}
  </article>
}
