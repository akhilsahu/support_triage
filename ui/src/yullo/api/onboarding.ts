import { API_CONFIG } from '../../config/api';
import { useYulloAppStore } from '../store/useYulloAppStore';

const getHeaders = (token?: string) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const csrfToken = useYulloAppStore.getState().csrfToken;
  if (csrfToken) {
    headers['X-Yullo-CSRF'] = csrfToken;
  }
  return headers;
};

export interface IdentityClaim {
  text: string;
  source_id: string;
  evidence_excerpt: string;
}

export interface AboutSuggestionResponse {
  status: 'ready' | 'insufficient_context' | 'needs_clarification' | 'unavailable';
  description?: string;
  category?: string;
  claims?: IdentityClaim[];
  clarification?: string;
  prompt_version?: string;
  input_fingerprint?: string;
  context_version?: number;
}

export const yulloOnboardingApi = {
  getDraft: async (token?: string) => {
    const res = await fetch(`${API_CONFIG.baseURL}${API_CONFIG.endpoints.yulloOnboardingDraft}`, {
      headers: getHeaders(token),
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to fetch draft');
    return res.json();
  },

  resetDraft: async (token?: string) => {
    const res = await fetch(`${API_CONFIG.baseURL}${API_CONFIG.endpoints.yulloOnboardingDraft}`, {
      method: 'DELETE',
      headers: getHeaders(token),
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to reset draft');
    return res.json();
  },
  
  createDraft: async (purpose: string, token?: string) => {
    const res = await fetch(`${API_CONFIG.baseURL}${API_CONFIG.endpoints.yulloOnboardingDraft}`, {
      method: 'POST',
      headers: getHeaders(token),
      credentials: 'include',
      body: JSON.stringify({ purpose }),
    });
    if (!res.ok) throw new Error('Failed to create draft');
    return res.json();
  },

  updateDraft: async (data: { name?: string; purpose?: string; handle?: string; description?: string; description_source?: string; category?: string; category_source?: string }, token?: string) => {
    const res = await fetch(`${API_CONFIG.baseURL}${API_CONFIG.endpoints.yulloOnboardingDraft}`, {
      method: 'PATCH',
      headers: getHeaders(token),
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update draft');
    return res.json();
  },
  
  validateHandle: async (handle: string, token?: string) => {
    const res = await fetch(`${API_CONFIG.baseURL}${API_CONFIG.endpoints.yulloValidateHandle}`, {
      method: 'POST',
      headers: getHeaders(token),
      credentials: 'include',
      body: JSON.stringify({ handle }),
    });
    if (!res.ok) throw new Error('Failed to validate handle');
    return res.json();
  },
  
  reserveHandle: async (handle: string, token?: string) => {
    const res = await fetch(`${API_CONFIG.baseURL}${API_CONFIG.endpoints.yulloReserveHandle}`, {
      method: 'POST',
      headers: getHeaders(token),
      credentials: 'include',
      body: JSON.stringify({ handle }),
    });
    if (!res.ok) throw new Error('Failed to reserve handle');
    return res.json();
  },
  
  addSourceUrl: async (url: string, sourceType: string = 'url', spaceId?: string, title?: string, token?: string) => {
    const res = await fetch(`${API_CONFIG.baseURL}${API_CONFIG.endpoints.yulloSourceUrl}`, {
      method: 'POST',
      headers: getHeaders(token),
      credentials: 'include',
      body: JSON.stringify({ space_id: spaceId, url, source_type: sourceType, title }),
    });
    if (!res.ok) throw new Error('Failed to add URL source');
    return res.json();
  },
  
  addSourceText: async (text: string, spaceId?: string, title?: string, token?: string) => {
    const res = await fetch(`${API_CONFIG.baseURL}${API_CONFIG.endpoints.yulloSourceText}`, {
      method: 'POST',
      headers: getHeaders(token),
      credentials: 'include',
      body: JSON.stringify({ space_id: spaceId, text, title }),
    });
    if (!res.ok) throw new Error('Failed to add text source');
    return res.json();
  },

  addSourceFile: async (file: File, spaceId?: string, token?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (spaceId) {
      formData.append('space_id', spaceId);
    }
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const csrfToken = useYulloAppStore.getState().csrfToken;
    if (csrfToken) {
      headers['X-Yullo-CSRF'] = csrfToken;
    }
    const res = await fetch(`${API_CONFIG.baseURL}/api/v1/yullo/onboarding/sources/file`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: formData,
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || 'Failed to upload file source');
    }
    return res.json();
  },
  
  deleteSource: async (sourceId: string, token?: string) => {
    const res = await fetch(`${API_CONFIG.baseURL}${API_CONFIG.endpoints.yulloSourceDelete(sourceId)}`, {
      method: 'DELETE',
      headers: getHeaders(token),
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to delete source');
    return res.json();
  },

  updateSource: async (sourceId: string, payload: { is_confirmed?: boolean; facts?: any[] }, token?: string) => {
    const res = await fetch(`${API_CONFIG.baseURL}${API_CONFIG.endpoints.yulloSourceUpdate(sourceId)}`, {
      method: 'PATCH',
      headers: getHeaders(token),
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to update source');
    return res.json();
  },

  getSpaceSources: async (spaceId: string, token?: string) => {
    const res = await fetch(`${API_CONFIG.baseURL}${API_CONFIG.endpoints.yulloSpaceSources(spaceId)}`, {
      headers: getHeaders(token),
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to fetch space sources');
    return res.json();
  },

  getSource: async (sourceId: string, token?: string) => {
    const res = await fetch(`${API_CONFIG.baseURL}/api/v1/yullo/onboarding/sources/${sourceId}`, {
      headers: getHeaders(token),
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to fetch source');
    return res.json();
  },

  getSourceContent: async (sourceId: string, token?: string) => {
    const res = await fetch(`${API_CONFIG.baseURL}/api/v1/yullo/onboarding/sources/${sourceId}/content`, {
      headers: getHeaders(token),
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to fetch source content');
    return res.text();
  },
  
  generatePreview: async (regenerate: boolean, token?: string) => {
    const res = await fetch(`${API_CONFIG.baseURL}${API_CONFIG.endpoints.yulloOnboardingPreview}`, {
      method: 'POST',
      headers: getHeaders(token),
      credentials: 'include',
      body: JSON.stringify({ regenerate }),
    });
    if (!res.ok) throw new Error('Failed to generate preview');
    return res.json();
  },
  
  launch: async (token?: string): Promise<{ ok: boolean; space_id: string; handle: string; status: string; public_path: string }> => {
    const res = await fetch(`${API_CONFIG.baseURL}${API_CONFIG.endpoints.yulloOnboardingLaunch}`, {
      method: 'POST',
      headers: getHeaders(token),
      credentials: 'include',
    });
    if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || 'Failed to launch space');
    }
    return res.json();
  },

  generateSummary: async (params: { spaceId?: string; name?: string; website?: string }, token?: string): Promise<AboutSuggestionResponse> => {
    const res = await fetch(`${API_CONFIG.baseURL}${API_CONFIG.endpoints.yulloGenerateSummary}`, {
      method: 'POST',
      headers: getHeaders(token),
      credentials: 'include',
      body: JSON.stringify({ space_id: params.spaceId, name: params.name, website: params.website }),
    });
    if (!res.ok) throw new Error('Failed to generate summary');
    return res.json();
  }
};
