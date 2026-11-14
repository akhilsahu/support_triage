import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NearbyArea } from '../api/nearby';
import { yulloApiClient } from '../api/client';
import { readBrowserLocation } from '../services/location';
import { useYulloAppStore } from '../store/useYulloAppStore';

interface LocationState {
  userId: string | null;
  area: NearbyArea | null;
  locating: boolean;
  automaticAvailable: boolean;
  message: string;
}
const initial: LocationState = { userId: null, area: null, locating: false, automaticAvailable: false, message: '' };
const LocationContext = createContext<LocationState & { requestLocation: () => void }>({ ...initial, requestLocation: () => {} });

export function YulloLocationProvider({ children }: { children: ReactNode }) {
  const userId = useYulloAppStore(state => state.isAuthenticated ? state.user?.id : undefined);
  const [state, setState] = useState<LocationState>(initial);
  const controller = useRef<AbortController>();
  const queryClient = useQueryClient();

  const collect = useCallback(async (expectedUserId: string, allowPrompt: boolean) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setState(previous => ({ ...(previous.userId === expectedUserId ? previous : initial), userId: expectedUserId, locating: true, message: '' }));
    const observation = await readBrowserLocation(allowPrompt);
    if (current.signal.aborted || useYulloAppStore.getState().user?.id !== expectedUserId) return;
    let area: NearbyArea = observation ? { latitude: observation.latitude, longitude: observation.longitude } : {};
    // Location-dependent UI can use the current fix without waiting for metadata storage.
    if (observation) setState({ userId: expectedUserId, area, locating: false, automaticAvailable: true, message: '' });
    let message = allowPrompt && !observation ? 'Location is unavailable. Nearby will use your saved area.' : '';
    try {
      // Server records the IP itself; browsers never submit or receive IP metadata.
      const response = await yulloApiClient.post<NearbyArea>('/home/location', observation ?? {}, {
        signal: current.signal, timeout: 8000, headers: { 'X-Yullo-Chat-Account': expectedUserId },
      });
      if (!observation) area = response.data;
      void queryClient.invalidateQueries({ queryKey: ['yullo-nearby', expectedUserId] });
    } catch {
      if (current.signal.aborted) return;
      if (observation) message = 'Nearby can use your location for this visit, but could not save it.';
    }
    if (current.signal.aborted || useYulloAppStore.getState().user?.id !== expectedUserId) return;
    setState({ userId: expectedUserId, area, locating: false, automaticAvailable: !!observation, message });
  }, [queryClient]);

  useEffect(() => {
    if (userId) void collect(userId, false); else setState(initial);
    return () => { controller.current?.abort(); };
  }, [userId, collect]);

  const requestLocation = useCallback(() => { if (userId) void collect(userId, true); }, [userId, collect]);
  const value = state.userId === userId ? state : initial;
  return <LocationContext.Provider value={{ ...value, requestLocation }}>{children}</LocationContext.Provider>;
}

export const useYulloLocation = () => useContext(LocationContext);
