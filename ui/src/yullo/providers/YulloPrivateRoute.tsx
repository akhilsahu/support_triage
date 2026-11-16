import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useYulloAppStore } from '../store/useYulloAppStore';
import { yulloApiClient } from '../api/client';
import { YulloAppProviders } from './YulloAppProviders';

export const YulloPrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, user, setAuth, clearAuth } = useYulloAppStore();
  const [isVerifying, setIsVerifying] = useState(!isAuthenticated);
  const location = useLocation();

  useEffect(() => {
    let mounted = true;

    const verifySession = async () => {
      try {
        const { data } = await yulloApiClient.get('/auth/me');
        if (mounted) {
          setAuth(data.user, data.csrf_token, data.preference?.appTheme);
          setIsVerifying(false);
        }
      } catch (err) {
        if (mounted) {
          clearAuth();
          setIsVerifying(false);
        }
      }
    };

    if (!isAuthenticated) {
      verifySession();
    } else {
      setIsVerifying(false);
    }

    return () => {
      mounted = false;
    };
  }, [isAuthenticated, setAuth, clearAuth]);

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/yullo/auth" state={{ from: location.pathname }} replace />;
  }

  if (!user?.onboarding_completed && location.pathname !== '/yullo/onboarding') {
    const handle = new URLSearchParams(location.search).get('handle');
    const suffix = handle && /^[a-z0-9_-]{3,50}$/.test(handle) ? `?handle=${encodeURIComponent(handle)}` : '';
    return <Navigate to={`/yullo/onboarding${suffix}`} replace />;
  }

  return (
    <YulloAppProviders>
      {children}
    </YulloAppProviders>
  );
};
