import { useQuery } from '@tanstack/react-query'
import { API_CONFIG } from '../../config/api'

export interface YulloEntityData {
  id: string
  space_id: string
  entity_type: string
  title: string
  payload_json: Record<string, any>
}

export function useYulloEntity(spaceId: string | undefined, entityId: string | undefined) {
  return useQuery<YulloEntityData>({
    queryKey: ['yulloEntity', spaceId, entityId],
    queryFn: async () => {
      if (!spaceId || !entityId) throw new Error("Missing required parameters")
      
      const response = await fetch(`${API_CONFIG.baseURL}/api/v1/yullo/public/spaces/${spaceId}/entities/${entityId}`)
      if (!response.ok) {
        throw new Error(`Failed to fetch entity: ${response.statusText}`)
      }
      return response.json()
    },
    enabled: !!spaceId && !!entityId,
    staleTime: 1000 * 60 * 5, // 5 minutes (these are published public entities, they don't change frequently)
  })
}
