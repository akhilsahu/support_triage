import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { GoogleLocationPicker } from './GoogleLocationPicker';
import { loadLocationMaps, mapsConfig, type GoogleMaps } from './googleLocationMaps';
vi.mock('./googleLocationMaps', async importOriginal => ({ ...await importOriginal<typeof import('./googleLocationMaps')>(), mapsConfig: { key: 'test', mapId: 'test' }, loadLocationMaps: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); mapsConfig.key = 'test'; });
it('keeps manual entry available without configuring or loading Google', () => {
  mapsConfig.key = '';
  render(<GoogleLocationPicker disabled={false} onSelect={vi.fn()} />);
  expect(screen.getByText(/not configured yet/)).toBeInTheDocument();
  expect(loadLocationMaps).not.toHaveBeenCalled();
});
it('fills the selected map pin and marker drag details automatically', async () => {
  const events: Record<string, (event?: unknown) => void> = {};
  const marker: { position: unknown } = { position: undefined };
  const geocode = vi.fn().mockResolvedValue({ results: [{ formatted_address: 'Found address', geometry: { location: { lat: () => 12, lng: () => 77 } } }] });
  class MapMock { panTo = vi.fn(); setZoom = vi.fn(); addListener = (name: string, fn: (event?: unknown) => void) => { events[name] = fn; return { remove: vi.fn() }; }; }
  class MarkerMock { get position() { return marker.position; } set position(value: unknown) { marker.position = value; } addListener = (name: string, fn: () => void) => { events[name] = fn; return { remove: vi.fn() }; }; }
  vi.mocked(loadLocationMaps).mockResolvedValue({ Map: MapMock, marker: { AdvancedMarkerElement: MarkerMock }, Geocoder: class { geocode = geocode; } } as unknown as GoogleMaps);
  const onSelect = vi.fn();
  render(<GoogleLocationPicker disabled={false} onSelect={onSelect} />);
  await waitFor(() => expect(events.click).toBeTypeOf('function'));
  events.click({ latLng: { lat: () => 13, lng: () => 78 } });
  await waitFor(() => expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ lat: 13, lng: 78, address: 'Found address' })));
  marker!.position = { lat: 14, lng: 79 }; events.dragend();
  await waitFor(() => expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ lat: 14, lng: 79, address: 'Found address' })));
});
