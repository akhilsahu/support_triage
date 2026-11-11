import { yulloApiClient } from './client';

export interface IdentityClaim {
  text: string;
  source_id: string;
  evidence_excerpt: string;
}

export interface CandidateMatch {
  title?: string;
  url?: string;
  snippet?: string;
  candidate_description?: string;
  candidate_category?: string;
}

export interface AboutSuggestionResponse {
  status: 'ready' | 'insufficient_context' | 'needs_clarification' | 'unavailable';
  description?: string;
  category?: string;
  claims?: IdentityClaim[];
  clarification?: string;
  candidate_match?: CandidateMatch;
  prompt_version?: string;
  input_fingerprint?: string;
  context_version?: number;
}

export interface SourceFact {
  id: string;
  source_item_id: string;
  source_version?: number | null;
  subject: string;
  label: string;
  value: string;
  note?: string | null;
  review_status: 'extracted' | 'owner_confirmed' | 'source_authoritative' | 'rejected' | 'superseded';
  verified: boolean;
  source_page?: number | null;
  source_chunk_id?: string | null;
  source_locator: string;
  last_verified_at?: string | null;
}

export type SourceDeletionMode = 'purge' | 'retain_for_review';

export interface SourceDeletionImpact {
  source_id: string;
  source_title: string;
  source_version: number;
  facts: number;
  entities_source_only: number;
  entities_with_other_evidence: number;
  vector_chunks: number;
  stored_artifacts: number;
}

export interface KnowledgeCleanupFact {
  id: string;
  subject: string;
  label: string;
  value: string;
  note?: string | null;
  review_status: string;
}

export interface KnowledgeCleanupAlert {
  id: string;
  space_id: string;
  deleted_source_id: string;
  source_title: string;
  source_locator?: string | null;
  facts: KnowledgeCleanupFact[];
  entities: Array<{
    id: string;
    entity_type: string;
    title: string;
    review_status: string;
  }>;
  entity_count: number;
  status: 'pending' | 'resolved';
  revision: number;
  created_at: string;
}

export const yulloOnboardingApi = {
  getDraft: async () => {
    const res = await yulloApiClient.get('/onboarding/draft');
    return res.data;
  },

  resetDraft: async () => {
    const res = await yulloApiClient.delete('/onboarding/draft');
    return res.data;
  },
  
  createDraft: async (purpose: string) => {
    const res = await yulloApiClient.post('/onboarding/draft', { purpose });
    return res.data;
  },

  updateDraft: async (data: { name?: string; purpose?: string; handle?: string; description?: string; description_source?: string; category?: string; category_source?: string }) => {
    const res = await yulloApiClient.patch('/onboarding/draft', data);
    return res.data;
  },
  
  validateHandle: async (handle: string) => {
    const res = await yulloApiClient.post('/onboarding/validate-handle', { handle });
    return res.data;
  },
  
  reserveHandle: async (handle: string) => {
    const res = await yulloApiClient.post('/onboarding/reserve-handle', { handle });
    return res.data;
  },
  
  addSourceUrl: async (url: string, sourceType: string = 'url', spaceId?: string, title?: string, background?: boolean) => {
    const res = await yulloApiClient.post('/onboarding/sources/url', { space_id: spaceId, url, source_type: sourceType, title, background });
    return res.data;
  },
  
  addSourceText: async (text: string, spaceId?: string, title?: string) => {
    const res = await yulloApiClient.post('/onboarding/sources/text', { space_id: spaceId, text, title });
    return res.data;
  },

  addSourceFile: async (file: File, spaceId?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (spaceId) {
      formData.append('space_id', spaceId);
    }
    const res = await yulloApiClient.post('/onboarding/sources/file', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },
  
  getSourceDeletionImpact: async (sourceId: string): Promise<SourceDeletionImpact> => {
    const res = await yulloApiClient.get(`/onboarding/sources/${sourceId}/deletion-impact`);
    return res.data;
  },

  deleteSource: async (
    sourceId: string,
    derivedData: SourceDeletionMode = 'purge',
    expectedSourceVersion?: number,
  ) => {
    const res = await yulloApiClient.delete(`/onboarding/sources/${sourceId}`, {
      data: {
        derived_data: derivedData,
        expected_source_version: expectedSourceVersion,
      },
    });
    return res.data;
  },

  getKnowledgeCleanupAlerts: async (spaceId: string): Promise<KnowledgeCleanupAlert[]> => {
    const res = await yulloApiClient.get(`/spaces/${spaceId}/knowledge-cleanup-alerts`, {
      params: { status: 'pending' },
    });
    return res.data;
  },

  resolveKnowledgeCleanupAlert: async (
    spaceId: string,
    alertId: string,
    payload: {
      action: 'delete' | 'keep';
      fact_ids: string[];
      entity_ids: string[];
      expected_revision: number;
      acknowledge_unverified?: boolean;
    },
  ) => {
    const res = await yulloApiClient.post(
      `/spaces/${spaceId}/knowledge-cleanup-alerts/${alertId}/resolve`,
      payload,
    );
    return res.data;
  },

  updateSource: async (sourceId: string, payload: { is_confirmed: boolean }) => {
    const res = await yulloApiClient.patch(`/onboarding/sources/${sourceId}`, payload);
    return res.data;
  },

  getSpaceSources: async (spaceId: string) => {
    const res = await yulloApiClient.get(`/onboarding/spaces/${spaceId}/sources`);
    return res.data;
  },

  getSource: async (sourceId: string) => {
    const res = await yulloApiClient.get(`/onboarding/sources/${sourceId}`);
    return res.data;
  },

  getSourceContent: async (sourceId: string) => {
    const res = await yulloApiClient.get(`/onboarding/sources/${sourceId}/content`, { responseType: 'text' });
    return res.data;
  },
  
  generatePreview: async (regenerate: boolean) => {
    const res = await yulloApiClient.post('/onboarding/preview', { regenerate });
    return res.data;
  },
  
  launch: async (): Promise<{ ok: boolean; space_id: string; handle: string; status: string; public_path: string }> => {
    const res = await yulloApiClient.post('/onboarding/launch');
    return res.data;
  },

  generateSummary: async (params: { 
    spaceId?: string; 
    name?: string; 
    website?: string; 
    sources?: any[]; 
    history?: Array<{ role: 'user' | 'assistant'; content: string }>; 
    user_message?: string;
  }): Promise<AboutSuggestionResponse> => {
    const res = await yulloApiClient.post('/onboarding/generate-summary', { 
      space_id: params.spaceId, 
      name: params.name, 
      website: params.website,
      sources: params.sources,
      history: params.history,
      user_message: params.user_message
    });
    return res.data;
  },

  retrySource: async (spaceId: string, sourceId: string) => {
    const res = await yulloApiClient.post(`/onboarding/spaces/${spaceId}/sources/${sourceId}/retry`);
    return res.data;
  },

  getSourceFacts: async (spaceId: string, sourceId: string): Promise<SourceFact[]> => {
    const res = await yulloApiClient.get(`/spaces/${spaceId}/sources/${sourceId}/facts`);
    return res.data;
  },

  reviewSourceFact: async (
    spaceId: string,
    sourceId: string,
    factId: string,
    reviewStatus: 'owner_confirmed' | 'rejected' | 'extracted',
    expectedStatus: string,
  ): Promise<SourceFact> => {
    const res = await yulloApiClient.patch(
      `/spaces/${spaceId}/sources/${sourceId}/facts/${factId}`,
      { review_status: reviewStatus, expected_status: expectedStatus },
    );
    return res.data;
  },

  streamSpaceSourcesUrl: (spaceId: string) => {
    return `${yulloApiClient.defaults.baseURL}/onboarding/spaces/${spaceId}/sources/stream`;
  }
};
