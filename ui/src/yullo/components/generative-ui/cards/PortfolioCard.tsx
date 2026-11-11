import { safeUrl } from '../shared/safeUrl'
import { SourceImage } from '../shared/SourceImage'
import { CardUnavailable } from '../shared/CardUnavailable'
import { useYulloEntity } from '../../../hooks/useYulloEntity'
import type { AuraEntitySnapshot } from '../../../services/aura/types'

export function PortfolioCard({ spaceId, entityId, entityData }: { spaceId: string, entityId?: string, entityData?: AuraEntitySnapshot }) {
  const { data: fetchedEntity, isLoading, isError, refetch } = useYulloEntity(spaceId, entityData ? undefined : entityId)
  const entity = entityData || fetchedEntity

  if (!entityData && isLoading) {
    return (
      <div className="w-full rounded-[var(--presentation-radius)] overflow-hidden bg-[var(--presentation-surface)] border border-[var(--presentation-border)] animate-pulse h-48" />
    )
  }

  if ((!entityData && isError) || !entity) return <CardUnavailable onRetry={entityId ? () => { void refetch() } : undefined} />
  const payload = entity.payload_json || {}
  const projectUrl = safeUrl(payload.project_url)
  const images = Array.isArray(payload.media_urls) ? [...new Set(payload.media_urls.filter((url: unknown): url is string => typeof url === "string" && !!safeUrl(url)))] : []

  return (
    <div className="w-full rounded-[var(--presentation-radius)] overflow-hidden bg-[var(--presentation-surface)] border border-[var(--presentation-border)] relative group" style={{ boxShadow: 'var(--presentation-card-shadow)' }}>
      {images.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[var(--presentation-accent-soft)]">
        {images.map((src, index) => <SourceImage key={src} src={src} alt={`${payload.title || entity.title} — image ${index + 1}`} />)}
      </div>}
      <div className="p-4 bg-[var(--presentation-surface)]">
        <h4 className="font-semibold text-[var(--presentation-text)] font-[var(--presentation-heading-font)]">{payload.title || entity.title}</h4>
        {payload.description && (
          <p className="text-sm text-[var(--presentation-muted)] mt-1">{payload.description}</p>
        )}
      </div>
      {projectUrl && (
        <a href={projectUrl} target="_blank" rel="noopener noreferrer" className="absolute inset-0 z-20" aria-label={`View ${payload.title || entity.title}`} />
      )}
    </div>
  )
}
