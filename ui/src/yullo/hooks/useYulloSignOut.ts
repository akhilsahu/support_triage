import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { yulloApiClient } from '../api/client';
import { useYulloAppStore } from '../store/useYulloAppStore';

export function useYulloSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setError('');
    try {
      await yulloApiClient.post('/auth/logout');
    } catch (reason) {
      if (!isAxiosError(reason) || reason.response?.status !== 401) {
        setError('Could not sign out. Please try again.');
        setSigningOut(false);
        return;
      }
    }
    // YulloAppProviders owns this cache separately from Support247.
    await queryClient.cancelQueries();
    queryClient.clear();
    navigate('/yullo/auth', { replace: true });
    useYulloAppStore.getState().clearAuth();
  };

  return { signOut, signingOut, error, clearError: () => setError('') };
}
