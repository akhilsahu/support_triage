import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type YulloUser = {
  id: string;
  email: string | null;
  phone?: string | null;
  created_at?: string | null;
  full_name: string | null;
  onboarding_completed: boolean;
};

type YulloAppTheme = 'system' | 'light' | 'warm' | 'dark' | 'dark-warm';
type YulloAppAccent = 'yullo' | 'cyan' | 'blue' | 'violet' | 'coral' | 'forest' | 'graphite' | 'plum';

interface YulloAppState {
  user: YulloUser | null;
  csrfToken: string | null;
  appTheme: YulloAppTheme;
  appAccent: YulloAppAccent;
  isAuthenticated: boolean;
  
  setAuth: (user: YulloUser, csrfToken: string, appTheme?: YulloAppTheme) => void;
  clearAuth: () => void;
  setTheme: (theme: YulloAppTheme) => void;
  setAccent: (accent: YulloAppAccent) => void;
}

export const useYulloAppStore = create<YulloAppState>()(
  persist(
    (set) => ({
      user: null,
      csrfToken: null,
      appTheme: 'system',
      appAccent: 'yullo',
      isAuthenticated: false,
      
      setAuth: (user, csrfToken, appTheme) => set((state) => ({ 
        user, 
        csrfToken, 
        isAuthenticated: true,
        appTheme: appTheme ?? state.appTheme 
      })),
      
      clearAuth: () => set({ 
        user: null, 
        csrfToken: null, 
        isAuthenticated: false,
        appTheme: 'system',
        appAccent: 'yullo'
      }),
      
      setTheme: (theme) => set({ appTheme: theme }),
      setAccent: (accent) => set({ appAccent: accent })
    }),
    {
      name: 'yullo-app-storage',
      // We only want to persist certain fields. The CSRF token should probably not be persisted across deep refreshes?
      // Wait, actually, the user can refresh the page, we don't want to lose the CSRF token unless we re-fetch /me.
      // But we DO fetch /me on load usually.
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        appTheme: state.appTheme,
        appAccent: state.appAccent,
        // We'll persist CSRF token so it survives a fast reload before /me completes
        csrfToken: state.csrfToken,
      }),
    }
  )
);
