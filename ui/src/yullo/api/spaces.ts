import { useQuery } from '@tanstack/react-query';
import { yulloApiClient } from './client';
import { useYulloAppStore } from '../store/useYulloAppStore';

export const SUBSPACE_DESCRIPTION_LIMIT = 4000;

export const spaceTypes = ['space', 'event', 'project', 'location', 'community', 'service', 'job', 'other', 'posting'] as const;
export type SpaceType = typeof spaceTypes[number];
export const spaceTypeLabel = (type: string) => type === 'posting' ? 'Post' : type.charAt(0).toUpperCase() + type.slice(1);
export const subspaceTypeSuggestions = ['Event', 'Post', 'Announcement', 'Service', 'Job', 'Project', 'Other'] as const;
export const spaceTypeFromLabel = (label: string): SpaceType => {
  const name = label.trim().toLowerCase();
  if (name === 'post' || name === 'announcement') return 'posting';
  return spaceTypes.find(type => type === name) || 'other';
};
export const spaceItemLabel = (type: string, label?: string | null) => label && !['Other', 'Space'].includes(label) ? label.toLowerCase() : type === 'posting' ? 'post' : type === 'other' ? 'item' : type;

export interface HierarchySpace {
  logo_url?: string | null;
  starts_at?: string | null;
  location_label?: string | null;
  id: string;
  name: string;
  slug: string;
  parent_space_id: string | null;
  space_type: SpaceType;
  type_label?: string | null;
  revision: number;
  status: string;
  active: boolean;
}

export const hierarchyKey = (ownerId: string | undefined) => ['yullo-space-hierarchy', ownerId];

export function useSpaceHierarchy(detailsFor?: string) {
  const ownerId = useYulloAppStore(state => state.user?.id);
  return useQuery({
    queryKey: [...hierarchyKey(ownerId), detailsFor || null],
    enabled: !!ownerId,
    queryFn: async ({ signal }) => {
      const { data } = await yulloApiClient.get<HierarchySpace[]>('/spaces/hierarchy', {
        signal, params: detailsFor ? { details_for: detailsFor } : undefined, headers: { 'X-Yullo-Chat-Account': ownerId },
      });
      if (useYulloAppStore.getState().user?.id !== ownerId) throw new Error('Account changed');
      return data;
    },
    gcTime: 0,
  });
}

export async function patchHierarchy(node: HierarchySpace, change: { parent_space_id?: string | null; space_type?: SpaceType; type_label?: string }, ownerId: string) {
  const { data } = await yulloApiClient.patch<HierarchySpace>(`/spaces/${node.id}/hierarchy`, {
    ...change, expected_revision: node.revision,
  }, { headers: { 'X-Yullo-Chat-Account': ownerId } });
  return data;
}

export interface QuickSpaceContext {
  subspace_fields?: SubspaceFields;
  location_mode?: 'online' | 'physical';
  meeting_url?: string;
  latitude?: number;
  longitude?: number;
  map_url?: string;
  starts_at?: string;
  place?: string;
  destination_url?: string;
  copied_company_revision?: number;
}

export interface SubspaceFields {
  price_amount: string | null;
  currency: string | null;
  details: { id: string; label: string; value: string }[];
}

export function formatSubspacePrice(fields?: SubspaceFields | null): string | null {
  if (fields?.price_amount == null || !fields.currency) return null;
  if (Number(fields.price_amount) === 0) return 'Free';
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: fields.currency }).format(Number(fields.price_amount)); }
  catch { return `${fields.currency} ${fields.price_amount}`; }
}


/** Ancestors first, with a cycle guard for legacy inconsistent data. */
export function spaceBranch(nodes: HierarchySpace[], spaceId?: string): HierarchySpace[] {
  const branch: HierarchySpace[] = [];
  const seen = new Set<string>();
  let node = nodes.find(item => item.id === spaceId);
  while (node && !seen.has(node.id)) {
    seen.add(node.id); branch.unshift(node);
    node = nodes.find(item => item.id === node!.parent_space_id);
  }
  return branch;
}
