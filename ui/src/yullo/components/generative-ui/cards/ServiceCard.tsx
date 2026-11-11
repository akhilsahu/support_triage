import { CardUnavailable } from '../shared/CardUnavailable'
import { useYulloEntity } from '../../../hooks/useYulloEntity'
import type { AuraEntitySnapshot } from '../../../services/aura/types'

export function ServiceCard({ spaceId, entityId, entityData }: { spaceId: string, entityId?: string, entityData?: AuraEntitySnapshot }) {
  const { data: fetchedEntity, isLoading, isError, refetch } = useYulloEntity(spaceId, entityData ? undefined : entityId)
  const entity = entityData || fetchedEntity

  if (!entityData && isLoading) {
    return (
      <div className="bg-[var(--presentation-surface)] rounded-[var(--presentation-radius)] p-5 border border-[var(--presentation-border)] animate-pulse h-32" />
    )
  }

  if ((!entityData && isError) || !entity) return <CardUnavailable onRetry={entityId ? () => { void refetch() } : undefined} />

  const payload = entity.payload_json || {}

  return (
    <div className="bg-[var(--presentation-surface)] rounded-[var(--presentation-radius)] p-5 border border-[var(--presentation-border)] border-l-4 border-l-[var(--presentation-accent)]" style={{ boxShadow: 'var(--presentation-card-shadow)' }}>
      <div className="w-10 h-10 rounded-xl bg-[var(--presentation-accent-soft)] flex items-center justify-center text-[var(--presentation-accent-ink)] mb-4">
        {/* Render icon if provided in payload, else default */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-[var(--presentation-text)] mb-2 font-[var(--presentation-heading-font)]">{payload.name || entity.title}</h3>
      <p className="text-sm text-[var(--presentation-muted)] leading-relaxed">
        {payload.description || ''}
      </p>
      {(payload.price_amount || payload.duration_minutes) && (
        <p className="mt-4 text-sm font-medium text-[var(--presentation-text)]">
          {payload.price_amount ? `${payload.currency || ''} ${payload.price_amount}`.trim() : ''}
          {payload.price_amount && payload.duration_minutes ? ' · ' : ''}
          {payload.duration_minutes ? `${payload.duration_minutes} min` : ''}
        </p>
      )}
    </div>
  )
}
