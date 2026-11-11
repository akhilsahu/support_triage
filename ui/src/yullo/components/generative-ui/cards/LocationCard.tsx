import { safeUrl } from '../shared/safeUrl'
import { CardUnavailable } from '../shared/CardUnavailable'
import { MapPin } from 'lucide-react'
import { useYulloEntity } from '../../../hooks/useYulloEntity'
import type { AuraEntitySnapshot } from '../../../services/aura/types'

export function LocationCard({ spaceId, entityId, entityData }: { spaceId: string, entityId?: string, entityData?: AuraEntitySnapshot }) {
  const { data: fetchedEntity, isLoading, isError, refetch } = useYulloEntity(spaceId, entityData ? undefined : entityId)
  const entity = entityData || fetchedEntity

  if (!entityData && isLoading) {
    return (
      <div className="flex items-start gap-4 p-4 rounded-[var(--presentation-radius)] bg-[var(--presentation-surface)] border border-[var(--presentation-border)] animate-pulse h-24" />
    )
  }

  if ((!entityData && isError) || !entity) return <CardUnavailable onRetry={entityId ? () => { void refetch() } : undefined} />
  const payload = entity.payload_json || {}
  const mapUrl = safeUrl(payload.map_url)

  return (
    <div className="flex items-start gap-4 p-4 rounded-[var(--presentation-radius)] bg-[var(--presentation-surface)] border border-[var(--presentation-border)]" style={{ boxShadow: 'var(--presentation-card-shadow)' }}>
      <div className="w-10 h-10 rounded-full bg-[var(--presentation-accent-soft)] border border-[var(--presentation-border)] flex items-center justify-center flex-shrink-0 text-[var(--presentation-accent-ink)]">
        <MapPin className="w-5 h-5" />
      </div>
      <div>
        <h4 className="font-medium text-[var(--presentation-text)] font-[var(--presentation-heading-font)]">{payload.name || entity.title}</h4>
        {payload.address && (
          <p className="text-sm text-[var(--presentation-muted)] mt-1">{payload.address}</p>
        )}
        {mapUrl && (
          <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-[var(--presentation-accent-ink)] mt-3 inline-flex items-center gap-1 underline decoration-[var(--presentation-accent)] underline-offset-4">
            Get directions
          </a>
        )}
      </div>
    </div>
  )
}
