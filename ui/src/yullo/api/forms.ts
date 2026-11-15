import { yulloApiClient } from './client';
import type { SpaceType, QuickSpaceContext, SubspaceFields } from './spaces';
import type { SpacePresentationConfig } from '../screens/appearance/presentation/schema';

export interface IdentityFormResponse {
  type_label?: string | null;
  subspace_fields?: SubspaceFields | null;
  presentation_config?: SpacePresentationConfig | null;
  parent_space_id?: string | null;
  event_context?: QuickSpaceContext | null;
  space_id?: string;
  purpose: 'person' | 'creator' | 'business' | 'organization';
  display_name: string;
  slug: string;
  logo_url?: string;
  description?: string;
  description_source?: 'owner' | 'aura' | null;
  description_prompt_version?: string | null;
  description_input_fingerprint?: string | null;
  category?: string;
  presence?: 'online' | 'physical' | 'both' | 'mobile';
  website?: string;
  revision: number;
  status?: string;
}

export interface IdentityFormUpdate {
  subspace_fields?: SubspaceFields;
  purpose?: 'person' | 'creator' | 'business' | 'organization';
  display_name?: string;
  logo_url?: string | null;
  description?: string | null;
  description_source?: 'owner' | 'aura' | null;
  description_prompt_version?: string | null;
  description_input_fingerprint?: string | null;
  category?: string | null;
  presence?: 'online' | 'physical' | 'both' | 'mobile' | null;
  website?: string | null;
  expected_revision: number;
}

export interface HandleCheckResponse {
  valid: boolean;
  reason?: string;
}

export interface CreateSpacePayload {
  logo_url?: string;
  quick_context?: QuickSpaceContext;
  parent_space_id?: string;
  space_type?: SpaceType;
  type_label?: string;
  display_name?: string;
  slug?: string;
  purpose?: 'person' | 'creator' | 'business' | 'organization';
  description?: string;
  category?: string;
  presence?: 'online' | 'physical' | 'both' | 'mobile';
  website?: string;
}

export interface CategorySuggestionItem {
  id: string;
  name: string;
  purpose?: string | null;
  is_popular: boolean;
  usage_count: number;
}

export const formsApi = {
  getCategorySuggestions: async (query?: string, purpose?: string, limit: number = 30): Promise<CategorySuggestionItem[]> => {
    const params: Record<string, any> = { limit };
    if (query && query.trim()) params.query = query.trim();
    if (purpose && purpose.trim()) params.purpose = purpose.trim();
    const response = await yulloApiClient.get('/spaces/categories/suggestions', { params });
    return response.data?.items || [];
  },
  createSpace: async (data?: CreateSpacePayload, ownerId?: string): Promise<IdentityFormResponse> => {
    const response = await yulloApiClient.post('/spaces', data || { display_name: 'Unnamed Space' }, {
      headers: ownerId ? { 'X-Yullo-Chat-Account': ownerId } : undefined,
    });
    return response.data;
  },


  getIdentity: async (spaceId: string, ownerId?: string): Promise<IdentityFormResponse> => {
    const response = await yulloApiClient.get(`/spaces/${spaceId}/forms/identity`, { headers: ownerId ? { 'X-Yullo-Chat-Account': ownerId } : undefined });
    return response.data;
  },

  updateIdentity: async (spaceId: string, data: IdentityFormUpdate): Promise<IdentityFormResponse> => {
    const response = await yulloApiClient.put(`/spaces/${spaceId}/forms/identity`, data);
    return response.data;
  },

  checkHandle: async (spaceId: string, handle: string): Promise<HandleCheckResponse> => {
    const response = await yulloApiClient.post(`/spaces/${spaceId}/forms/identity/check-handle`, { handle });
    return response.data;
  },

  changeHandle: async (spaceId: string, handle: string, expected_revision: number): Promise<IdentityFormResponse> => {
    const response = await yulloApiClient.post(`/spaces/${spaceId}/forms/identity/change-handle`, {
      handle,
      expected_revision,
    });
    return response.data;
  },

  archiveOrDelete: async (spaceId: string, action: 'archive' | 'delete' = 'archive') => {
    try {
      const response = await yulloApiClient.delete(`/spaces/${spaceId}?action=${action}`);
      return response.data;
    } catch (err: any) {
      if (err.response?.status === 404 || err.response?.status === 405) {
        const fallback = await yulloApiClient.delete(`/onboarding/spaces/${spaceId}?action=${action}`);
        return fallback.data;
      }
      throw err;
    }
  },

  toggleLive: async (spaceId: string, live: boolean): Promise<IdentityFormResponse> => {
    const response = await yulloApiClient.post(`/spaces/${spaceId}/forms/identity/toggle-live`, { live });
    return response.data;
  }
};

