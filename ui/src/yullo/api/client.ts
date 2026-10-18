import axios from 'axios';
import { useYulloAppStore } from '../store/useYulloAppStore';

const API_URL = import.meta.env.VITE_API_URL || '';

/**
 * Isolated Yullo API Client
 * - Explicitly uses credentials: 'include' for __Host-yullo_session cookies
 * - Will strictly inject X-Yullo-CSRF for POST/PUT/DELETE
 * - Does NOT intercept to inject Bearer tokens
 */
export const yulloApiClient = axios.create({
  baseURL: `${API_URL}/api/v1/yullo`,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

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
  (error) => {
    // If we get a 401 or 403, and it's not the login endpoint, clear auth
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      if (!error.config.url?.includes('/auth/')) {
        useYulloAppStore.getState().clearAuth();
      }
    }
    return Promise.reject(error);
  }
);
