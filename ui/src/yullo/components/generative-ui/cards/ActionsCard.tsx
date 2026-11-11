import { safeUrl } from '../shared/safeUrl'
import { CardUnavailable } from '../shared/CardUnavailable'
import { useYulloEntities } from '../../../hooks/useYulloEntities'
import type { AuraEntitySnapshot } from '../../../services/aura/types'

export function ActionsCard({ spaceId, entityIds, entityData = [] }: { spaceId: string, entityIds: string[], entityData?: AuraEntitySnapshot[] }) {
  const queryResults = useYulloEntities(spaceId, entityIds.filter(id => !entityData.some(entity => entity.id === id)))
  
  const isLoading = queryResults.some(q => q.isLoading)
  const entities = [...entityData, ...queryResults.map(q => q.data).filter(Boolean)]

  if (isLoading) {
    return (
      <div className="flex flex-wrap items-center gap-3 mt-2 animate-pulse">
        <div className="h-10 w-24 bg-[var(--presentation-accent-soft)] rounded-xl" />
        <div className="h-10 w-32 bg-[var(--presentation-accent-soft)] rounded-xl" />
      </div>
    )
  }

  const failed = queryResults.filter(q => q.isError)
  const retry = () => { failed.forEach(q => { void q.refetch() }) }
  if (entities.length === 0) return <CardUnavailable onRetry={failed.length ? retry : undefined} />

  return (
    <div className="flex flex-wrap items-center gap-3 mt-2">
      {failed.length > 0 && <CardUnavailable onRetry={retry} />}
      {entities.map((entity, i) => {
        const payload = entity!.payload_json || {}
        const href = safeUrl(payload.destination_url, true)
        if (!href) return <CardUnavailable key={entity!.id} />
        if (payload.kind === 'external_link') {
          return (
            <div key={entity!.id} className="flex items-center gap-3">
              {i > 0 && <span className="text-[var(--presentation-border)]">·</span>}
              <a 
                href={href}
                className="text-sm font-medium text-[var(--presentation-muted)] hover:text-[var(--presentation-text)] transition-colors hover:underline underline-offset-4"
                target="_blank"
                rel="noopener noreferrer"
              >
                {payload.label || entity!.title}
              </a>
            </div>
          )
        }

        return (
          <a 
            key={entity!.id}
            href={href}
            className={`px-5 py-2.5 rounded-[var(--presentation-radius)] font-medium text-sm transition-all flex items-center gap-2 ${
              payload.kind !== 'external_link'
                ? 'bg-[var(--presentation-accent)] text-[var(--presentation-accent-contrast)] hover:opacity-90'
                : 'bg-[var(--presentation-surface)] border border-[var(--presentation-border)] text-[var(--presentation-text)] hover:border-[var(--presentation-accent)]'
            }`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {payload.label || entity!.title}
            {payload.kind !== 'external_link' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            )}
          </a>
        )
      })}
    </div>
  )
}
