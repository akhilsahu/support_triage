import { useYulloEntity } from '../../../hooks/useYulloEntity'

export function ServiceCard({ spaceId, entityId }: { spaceId: string, entityId: string }) {
  const { data: entity, isLoading } = useYulloEntity(spaceId, entityId)

  if (isLoading) {
    return (
      <div className="bg-[#F4F5F7] rounded-xl p-5 border-l-4 border-l-[#E2E8F0] animate-pulse h-32" />
    )
  }

  if (!entity) return null

  const payload = entity.payload_json || {}

  return (
    <div className="bg-[#F4F5F7] rounded-xl p-5 hover:bg-[#EEF0F3] transition-colors border-l-4 border-l-[#FFFC00]">
      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4">
        {/* Render icon if provided in payload, else default */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{entity.title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed mb-4">
        {payload.description || ''}
      </p>
      {payload.url && (
        <a href={payload.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-gray-900 hover:text-black hover:underline underline-offset-4 decoration-2 decoration-[#FFFC00]">
          View details
        </a>
      )}
    </div>
  )
}
