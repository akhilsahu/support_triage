import { ArrowUpRight, CalendarDays, Clock3, MapPin } from 'lucide-react'
import type { UpcomingEvent } from '../../../services/aura/types'

export function UpcomingEvents({ events }: { events: UpcomingEvent[] }) {
  if (!events.length) return null

  return (
    <section aria-label="Upcoming events" className="my-8 w-full self-center text-start" style={{ maxWidth: 'var(--presentation-content-width)' }}>
      <h2 className="mb-4 text-xl font-semibold text-[var(--presentation-text)]">Upcoming events</h2>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
        {events.slice(0, 3).map(event => {
          const start = new Date(event.starts_at)
          const location = event.is_remote ? 'Online / Remote' : event.location?.name || event.location?.address
          return (
            <a key={event.url} href={event.url} target="_blank" rel="noopener noreferrer"
              className="group min-w-0 overflow-hidden rounded-[var(--presentation-radius)] border border-[var(--presentation-border)] bg-[var(--presentation-surface)] text-[var(--presentation-text)] transition-colors hover:border-[var(--presentation-accent-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--presentation-accent-ink)] motion-reduce:transition-none">
              <div className="flex aspect-[16/9] items-center justify-center overflow-hidden bg-[var(--presentation-accent-soft)]">
                {event.cover_url
                  ? <img src={event.cover_url} alt="" loading="lazy" className="h-full w-full object-contain" />
                  : <CalendarDays size={32} className="text-[var(--presentation-accent-ink)]" aria-hidden="true" />}
              </div>
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 break-words text-base font-semibold leading-snug">{event.title}</h3>
                  <ArrowUpRight size={17} className="shrink-0 text-[var(--presentation-accent-ink)]" aria-hidden="true" />
                </div>
                <div className="space-y-2 text-sm text-[var(--presentation-muted)]">
                  <div className="flex items-center gap-2"><CalendarDays size={15} className="shrink-0" aria-hidden="true" /><time dateTime={event.starts_at}>{start.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</time></div>
                  <div className="flex items-center gap-2"><Clock3 size={15} className="shrink-0" aria-hidden="true" />{start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' })}</div>
                  {location && <div className="flex items-start gap-2"><MapPin size={15} className="mt-0.5 shrink-0" aria-hidden="true" /><span className="line-clamp-2">{location}</span></div>}
                </div>
                <span className="inline-block text-sm font-medium text-[var(--presentation-accent-ink)]">View event<span className="sr-only"> (opens in a new tab)</span></span>
              </div>
            </a>
          )
        })}
      </div>
    </section>
  )
}
