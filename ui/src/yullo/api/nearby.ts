import { useQuery } from '@tanstack/react-query';
import { useYulloAppStore } from '../store/useYulloAppStore';
import { yulloApiClient } from './client';

export type NearbyScope = 'all' | 'nearby' | 'city' | 'remote';
export interface NearbyArea {
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  region?: string | null;
  country_code?: string | null;
}
export interface NearbyOrigin extends NearbyArea {
  id: string;
  name: string;
  space_id: string;
  space_name: string;
}
export interface NearbyRequest extends NearbyArea {
  location_id?: string;
  scope: NearbyScope;
}
export interface NearbyItem {
  id: string;
  kind: 'space' | 'event';
  space_id: string;
  space_name: string;
  slug: string;
  title: string;
  area_label: string;
  tier: 'nearby' | 'city' | 'region' | 'country' | 'remote';
  distance_km: number | null;
  starts_at: string | null;
}
interface NearbyResponse {
  items: NearbyItem[];
  radius_km: number;
  limit: number;
}

export function useNearbyOrigins(enabled: boolean) {
  const userId = useYulloAppStore(state => state.user?.id);
  return useQuery({
    queryKey: ['yullo-nearby', userId, 'locations'],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => (await yulloApiClient.get<NearbyOrigin[]>('/home/nearby/locations', { signal })).data,
    gcTime: 0,
  });
}

export function useNearby(request: NearbyRequest, enabled: boolean) {
  const userId = useYulloAppStore(state => state.user?.id);
  return useQuery({
    queryKey: ['yullo-nearby', userId, 'results', request],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => (await yulloApiClient.post<NearbyResponse>('/home/nearby', request, { signal })).data,
    gcTime: 0,
  });
}
