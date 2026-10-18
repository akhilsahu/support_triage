import React, { ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useYulloAppStore } from '../store/useYulloAppStore';
import '../styles/tokens.css';

// Completely isolated from Support247 QueryClient
const yulloQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true, // We want the Home page to be fresh when they tab back
      retry: 1,
      staleTime: 0, // Never stale, let HTTP Cache-Control dictate or force fetch
    },
  },
});

export const YulloAppProviders = ({ children }: { children: ReactNode }) => {
  const appTheme = useYulloAppStore((state) => state.appTheme);
  const appAccent = useYulloAppStore((state) => state.appAccent);

  // Resolve the effective theme name for CSS attribute selectors
  const resolvedTheme = (() => {
    if (appTheme === 'dark') return 'dark';
    if (appTheme === 'warm') return 'warm';
    if (appTheme === 'dark-warm') return 'dark-warm';
    if (appTheme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return 'light';
  })();

  // Sync data-theme and data-accent to <html> so tokens.css selectors activate
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.setAttribute('data-accent', appAccent);
    document.documentElement.classList.add('yullo-app');
    return () => {
      // Clean up when leaving Yullo routes
      document.documentElement.removeAttribute('data-theme');
      document.documentElement.removeAttribute('data-accent');
      document.documentElement.classList.remove('yullo-app');
    };
  }, [resolvedTheme, appAccent]);

  return (
    <QueryClientProvider client={yulloQueryClient}>
      <div
        data-theme={resolvedTheme}
        data-accent={appAccent}
        className="yullo-app min-h-screen bg-[var(--canvas)] text-[var(--text-primary)] font-[Instrument_Sans] transition-colors duration-300"
      >
        {children}
      </div>
    </QueryClientProvider>
  );
};
