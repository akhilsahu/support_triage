import { MapPin } from 'lucide-react'
import { useYulloEntity } from '../../../hooks/useYulloEntity'

export function LocationCard({ spaceId, entityId }: { spaceId: string, entityId: string }) {
  const { data: entity, isLoading } = useYulloEntity(spaceId, entityId)

  if (isLoading) {
    return (
      <div className="flex items-start gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100 animate-pulse h-24" />
    )
  }

  if (!entity) return null
  const payload = entity.payload_json || {}

  return (
    <div className="flex items-start gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100">
      <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 text-gray-400">
        <MapPin className="w-5 h-5" />
      </div>
      <div>
        <h4 className="font-medium text-gray-900">{entity.title}</h4>
        {payload.openingHours && (
          <p className="text-sm text-gray-500 mt-1">{payload.openingHours}</p>
        )}
        {payload.address && (
          <p className="text-sm text-gray-500 mt-1">{payload.address}</p>
        )}
        {payload.directionsUrl && (
          <a href={payload.directionsUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-600 hover:text-blue-700 mt-3 flex items-center gap-1">
            Get directions
          </a>
        )}
      </div>
    </div>
  )
}
