import { useQueries } from '@tanstack/react-query'
import { API_CONFIG } from '../../config/api'
import { YulloEntityData } from './useYulloEntity'

export function useYulloEntities(spaceId: string | undefined, entityIds: string[]) {
  return useQueries({
    queries: entityIds.map(id => ({
      queryKey: ['yulloEntity', spaceId, id],
      queryFn: async (): Promise<YulloEntityData> => {
        if (!spaceId) throw new Error("Missing spaceId")
        const response = await fetch(`${API_CONFIG.baseURL}/api/v1/yullo/public/spaces/${spaceId}/entities/${id}`)
        if (!response.ok) {
          throw new Error(`Failed to fetch entity: ${response.statusText}`)
        }
        return response.json()
      },
      enabled: !!spaceId && !!id,
      staleTime: 1000 * 60 * 5,
    }))
  })
}
