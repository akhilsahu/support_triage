import { useYulloEntity } from '../../../hooks/useYulloEntity'

export function PortfolioCard({ spaceId, entityId }: { spaceId: string, entityId: string }) {
  const { data: entity, isLoading } = useYulloEntity(spaceId, entityId)

  if (isLoading) {
    return (
      <div className="w-full rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 animate-pulse h-48" />
    )
  }

  if (!entity) return null
  const payload = entity.payload_json || {}

  return (
    <div className="w-full rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 relative group cursor-pointer">
      <div className="aspect-video w-full bg-gray-200 flex items-center justify-center relative overflow-hidden">
        {payload.imageUrl ? (
          <img src={payload.imageUrl} alt={entity.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300" />
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center z-10 text-white shadow-sm">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
          </>
        )}
      </div>
      <div className="p-4 bg-white">
        <h4 className="font-semibold text-gray-900">{entity.title}</h4>
        {payload.subtitle && (
          <p className="text-sm text-gray-500 mt-1">{payload.subtitle}</p>
        )}
      </div>
      {payload.url && (
        <a href={payload.url} target="_blank" rel="noopener noreferrer" className="absolute inset-0 z-20" aria-label={`View ${entity.title}`} />
      )}
    </div>
  )
}
