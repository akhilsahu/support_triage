import { YULLO_API_ORIGIN, yulloApiClient } from './client';

export interface PublicResource {
  id: string;
  title: string;
  kind: 'pdf' | 'image' | 'link' | 'note' | 'file';
  href: string;
}
export const resourceHref = (resource: PublicResource) => `${YULLO_API_ORIGIN}${resource.href}`;
export async function listResources(spaceId: string, signal: AbortSignal): Promise<PublicResource[]> {
  const response = await fetch(`${YULLO_API_ORIGIN}/api/v1/yullo/public/spaces/${spaceId}/resources`, { signal, cache: 'no-store', credentials: 'omit' });
  if (!response.ok) throw new Error('Resources unavailable');
  return response.json();
}
export async function setPublicResource(spaceId: string, sourceId: string, enabled: boolean, sourceVersion: number, revision: number) {
  return (await yulloApiClient.patch<{ public_resource: boolean; resource_revision: number }>(`/spaces/${spaceId}/sources/${sourceId}/public-resource`, {
    enabled, expected_source_version: sourceVersion, expected_revision: revision,
  })).data;
}
