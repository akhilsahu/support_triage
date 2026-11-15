import { CanceledError } from 'axios';
import { useQuery } from '@tanstack/react-query';
import { yulloApiClient } from './client';
import type { NearbyArea } from './nearby';
import { useYulloAppStore } from '../store/useYulloAppStore';

export const beaconReaches = [
  { value: 'nearby', label: 'Nearby' },
  { value: 'city', label: 'City' },
  { value: 'country', label: 'Country' },
  { value: 'worldwide', label: 'Worldwide' },
] as const;
export type BeaconReach = typeof beaconReaches[number]['value'] | 'nearby_5' | 'nearby_10';
export const isNearbyReach = (reach: BeaconReach) => reach === 'nearby' || reach === 'nearby_5' || reach === 'nearby_10';
export interface BeaconSettings {
  reach: BeaconReach;
  radius_km?: number | null;
  target_area: NearbyArea;
  origin_location_entity_id?: string | null;
  expires_at: string;
}
export interface BeaconState {
  config: BeaconSettings | null;
  revision: number;
  status: 'inactive' | 'active' | 'paused' | 'expired' | 'unavailable';
  can_activate: boolean;
  enabled: boolean;
  target_changed: boolean;
  event_expires_at: string | null;
  default_expires_at: string | null;
  latest_expires_at: string | null;
}
export interface BeaconCard {
  space_id: string; title: string; url: string; space_type: string; type_label: string;
  cover_url: string | null; starts_at: string | null; location_label: string | null;
  reach: BeaconReach; area_label: string; expires_at: string;
}
export const beaconKey = (ownerId: string | undefined, spaceId: string) => ['yullo-beacon', ownerId, spaceId];
const assertAccount = (ownerId: string) => {
  if (useYulloAppStore.getState().user?.id !== ownerId) throw new CanceledError('Account changed');
};
export function useBeacon(spaceId: string, enabled = true) {
  const ownerId = useYulloAppStore(state => state.user?.id);
  return useQuery<BeaconState>({
    queryKey: beaconKey(ownerId, spaceId), enabled: !!ownerId && enabled, gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: query => query.state.status === 'success' ? 60000 : false,
    queryFn: async ({ signal }) => {
      assertAccount(ownerId!);
      const result = await yulloApiClient.get<BeaconState>(`/spaces/${spaceId}/beacon`, { signal, headers: { 'X-Yullo-Chat-Account': ownerId } });
      assertAccount(ownerId!);
      return result.data;
    },
  });
}
export async function saveBeacon(ownerId: string, spaceId: string, expectedRevision: number, config?: BeaconSettings) {
  assertAccount(ownerId);
  const body = { expected_revision: expectedRevision, ...(config ? { config } : {}) };
  const options = { headers: { 'X-Yullo-Chat-Account': ownerId } };
  const response = config
    ? await yulloApiClient.put<BeaconState>(`/spaces/${spaceId}/beacon`, body, options)
    : await yulloApiClient.post<BeaconState>(`/spaces/${spaceId}/beacon/pause`, body, options);
  assertAccount(ownerId);
  return response.data;
}
