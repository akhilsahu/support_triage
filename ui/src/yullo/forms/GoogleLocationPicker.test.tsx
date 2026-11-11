import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GoogleLocationPicker } from './GoogleLocationPicker';
import { loadLocationMaps, mapsConfig, type GoogleMaps } from './googleLocationMaps';
vi.mock('./googleLocationMaps', async importOriginal => ({ ...await importOriginal<typeof import('./googleLocationMaps')>(), mapsConfig: { key: 'test', mapId: 'test' }, loadLocationMaps: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); mapsConfig.key = 'test'; });
it('keeps manual entry available without configuring or loading Google', () => {
  mapsConfig.key = '';
  render(<GoogleLocationPicker address="" disabled={false} onSelect={vi.fn()} />);
  expect(screen.getByText(/not configured yet/)).toBeInTheDocument();
  expect(loadLocationMaps).not.toHaveBeenCalled();
});
it('searches and requires confirmation; map click and marker drag resolve a new candidate', async () => {
  const events: Record<string, (event?: unknown) => void> = {};
  const marker: { position: unknown } = { position: undefined };
  const geocode = vi.fn().mockResolvedValue({ results: [{ formatted_address: 'Found address', geometry: { location: { lat: () => 12, lng: () => 77 } } }] });
  class MapMock { panTo = vi.fn(); setZoom = vi.fn(); addListener = (name: string, fn: (event?: unknown) => void) => { events[name] = fn; return { remove: vi.fn() }; }; }
  class MarkerMock { get position() { return marker.position; } set position(value: unknown) { marker.position = value; } addListener = (name: string, fn: () => void) => { events[name] = fn; return { remove: vi.fn() }; }; }
  vi.mocked(loadLocationMaps).mockResolvedValue({ Map: MapMock, marker: { AdvancedMarkerElement: MarkerMock }, Geocoder: class { geocode = geocode; } } as unknown as GoogleMaps);
  const onSelect = vi.fn(); const user = userEvent.setup();
  render(<GoogleLocationPicker address="Main street" disabled={false} onSelect={onSelect} />);
  await user.click(screen.getByRole('button', { name: 'Open map' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Search map' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Search map' }));
  await user.click(await screen.findByRole('button', { name: 'Found address' }));
  expect(onSelect).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Use this location' }));
  expect(onSelect).toHaveBeenLastCalledWith({ lat: 12, lng: 77, address: 'Found address' });
  events.click({ latLng: { lat: () => 13, lng: () => 78 } });
  await user.click(await screen.findByRole('button', { name: 'Use this location' }));
  expect(onSelect).toHaveBeenLastCalledWith({ lat: 13, lng: 78, address: 'Found address' });
  marker!.position = { lat: 14, lng: 79 }; events.dragend();
  await user.click(await screen.findByRole('button', { name: 'Use this location' }));
  expect(onSelect).toHaveBeenLastCalledWith({ lat: 14, lng: 79, address: 'Found address' });
});
