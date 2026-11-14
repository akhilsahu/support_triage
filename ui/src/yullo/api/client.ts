import axios, { type InternalAxiosRequestConfig } from 'axios';
import { useYulloAppStore } from '../store/useYulloAppStore';

// Production uses the existing /api proxy so HttpOnly sessions stay first-party.
export const YULLO_API_ORIGIN = import.meta.env.PROD ? '' : import.meta.env.VITE_API_URL || '';

/**
 * Isolated Yullo API Client
 * - Explicitly uses credentials: 'include' for __Host-yullo_session cookies
 * - Will strictly inject X-Yullo-CSRF for POST/PUT/DELETE
 * - Does NOT intercept to inject Bearer tokens
 */
export const yulloApiClient = axios.create({
  baseURL: `${YULLO_API_ORIGIN}/api/v1/yullo`,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

type RetryableYulloRequest = InternalAxiosRequestConfig & {
  _yulloCsrfRetried?: boolean;
};

let csrfRefreshPromise: Promise<string> | null = null;

const refreshCsrfToken = async (): Promise<string> => {
  if (!csrfRefreshPromise) {
    csrfRefreshPromise = yulloApiClient
      .get('/auth/me')
      .then(({ data }) => {
        // Token renewal must not overwrite the active UI theme with a stale preference.
        useYulloAppStore.getState().setAuth(
          data.user,
          data.csrf_token,
        );
        return data.csrf_token as string;
      })
      .finally(() => {
        csrfRefreshPromise = null;
      });
  }
  return csrfRefreshPromise;
};

/** Fetch transport for SSE; shares cookie/CSRF refresh with the JSON client. */
export async function yulloFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const request = () => {
    const headers = new Headers(options.headers);
    const csrf = useYulloAppStore.getState().csrfToken;
    if (csrf && !['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase())) headers.set('X-Yullo-CSRF', csrf);
    return fetch(url, { ...options, headers, credentials: 'include' });
  };
  let response = await request();
  if (response.status === 403 && (await response.clone().json().catch(() => ({}))).detail === 'Invalid CSRF token') {
    await refreshCsrfToken();
    response = await request();
  }
  if (response.status === 401) {
    useYulloAppStore.getState().clearAuth();
    window.dispatchEvent(new Event('yullo-session-refresh'));
  }
  return response;
}

// Interceptor to attach CSRF token to mutating requests
yulloApiClient.interceptors.request.use((config) => {
  if (config.method && ['post', 'put', 'patch', 'delete'].includes(config.method.toLowerCase())) {
    const csrfToken = useYulloAppStore.getState().csrfToken;
    if (csrfToken) {
      config.headers['X-Yullo-CSRF'] = csrfToken;
    }
  }
  return config;
});

yulloApiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config as RetryableYulloRequest | undefined;
    const isInvalidCsrf =
      error.response?.status === 403 &&
      error.response?.data?.detail === 'Invalid CSRF token';

    if (isInvalidCsrf && request && !request._yulloCsrfRetried) {
      request._yulloCsrfRetried = true;
      try {
        const csrfToken = await refreshCsrfToken();
        request.headers['X-Yullo-CSRF'] = csrfToken;
        return yulloApiClient.request(request);
      } catch {
        useYulloAppStore.getState().clearAuth();
      }
    }

    // A 403 can be a valid authorization denial; only 401 means the session ended.
    if (error.response?.status === 401 && !request?.url?.includes('/auth/')) {
      useYulloAppStore.getState().clearAuth();
      window.dispatchEvent(new Event('yullo-session-refresh'));
    }
    return Promise.reject(error);
  }
);
