import React, { useEffect, useRef, useState } from 'react';
import { loadLocationMaps, mapsConfig, validPoint, type GoogleMaps, type MapInstance, type MarkerInstance, type Point, type GeocodeResult } from './googleLocationMaps';

type Selection = Point & { address?: string };
export function GoogleLocationPicker({ initialPoint, address, disabled, onSelect }: {
  initialPoint?: Point; address: string; disabled: boolean; onSelect: (selection: Selection) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const api = useRef<GoogleMaps>();
  const map = useRef<MapInstance>();
  const marker = useRef<MarkerInstance>();
  const sequence = useRef(0);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState(address);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [candidate, setCandidate] = useState<Selection>();
  const [searching, setSearching] = useState(false);
  const startingPoint = useRef(initialPoint);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const invalidateRequests = () => { sequence.current++; };
    const listeners: { remove(): void }[] = [];
    loadLocationMaps().then(sdk => {
      if (!active || !node.current) return;
      api.current = sdk;
      const initial = startingPoint.current;
      map.current = new sdk.Map(node.current, { center: initial || { lat: 0, lng: 0 }, zoom: initial ? 16 : 2, mapId: mapsConfig.mapId, gestureHandling: 'cooperative', streetViewControl: false, mapTypeControl: false });
      marker.current = new sdk.marker.AdvancedMarkerElement({ map: map.current, position: initial, gmpDraggable: true, title: 'Selected location — drag to adjust' });
      const pick = async (point: Point) => {
        if (!validPoint(point)) return;
        const request = ++sequence.current;
        marker.current!.position = point;
        setResults([]); setCandidate(undefined); setSearching(true); setError('');
        try {
          const response = await new sdk.Geocoder().geocode({ location: point });
          if (active && request === sequence.current) setCandidate({ ...point, address: response.results[0]?.formatted_address });
        } catch {
          if (active && request === sequence.current) { setCandidate(point); setError('Address lookup failed. You can use this pin and enter the address manually.'); }
        } finally { if (active && request === sequence.current) setSearching(false); }
      };
      listeners.push(map.current.addListener('click', event => { if (event.latLng) void pick({ lat: event.latLng.lat(), lng: event.latLng.lng() }); }));
      listeners.push(marker.current.addListener('dragend', () => {
        const position = marker.current?.position;
        if (!position) return;
        void pick(typeof position.lat === 'function' ? { lat: position.lat(), lng: (position as { lng(): number }).lng() } : position as Point);
      }));
      setReady(true);
    }).catch(() => { if (active) setError('Google Maps could not load. Check the map configuration, or enter the address manually.'); });
    return () => { active = false; invalidateRequests(); listeners.forEach(listener => listener.remove()); if (marker.current) marker.current.map = null; map.current = undefined; api.current = undefined; };
  }, [open]);

  const initialLat = initialPoint?.lat;
  const initialLng = initialPoint?.lng;
  useEffect(() => {
    if (marker.current) marker.current.position = initialLat !== undefined && initialLng !== undefined ? { lat: initialLat, lng: initialLng } : undefined;
  }, [initialLat, initialLng]);

  const search = async () => {
    if (!api.current || !query.trim()) return;
    const request = ++sequence.current;
    setSearching(true); setError(''); setCandidate(undefined); setResults([]);
    try {
      const response = await new api.current.Geocoder().geocode({ address: query.trim() });
      if (request !== sequence.current) return;
      setResults(response.results);
      if (!response.results.length) setError('No address found. Try a more complete address or drop a pin.');
    } catch { if (request === sequence.current) setError('Could not find this address. Try again or drop a pin.'); }
    finally { if (request === sequence.current) setSearching(false); }
  };
  return <div className="my-6 border-y border-[var(--border)] py-4">
    <p className="font-medium">Choose on Google Maps</p>
    {!mapsConfig.key ? <p className="mt-2 text-sm text-[var(--text-secondary)]">Map selection is not configured yet. You can still enter the address and map link below.</p> : !open ?
      <button type="button" disabled={disabled} onClick={() => setOpen(true)} className="min-h-12 text-[var(--accent-ink)]">Open map</button> : <>
        <label htmlFor="map-search" className="mt-3 block text-sm">Search an address</label>
        <div className="mt-2 flex flex-wrap gap-2"><input id="map-search" value={query} disabled={disabled} onChange={e => { sequence.current++; setSearching(false); setResults([]); setCandidate(undefined); setQuery(e.target.value); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }} className="min-h-12 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-base" /><button type="button" onClick={() => void search()} disabled={!ready || searching || disabled || !query.trim()} className="min-h-12 px-4 text-[var(--accent-ink)]">Search map</button></div>
        {!!results.length && <ul aria-label="Address results" className="my-3 divide-y divide-[var(--border)]">{results.map((result, i) => <li key={i}><button type="button" disabled={disabled} className="min-h-12 py-2 text-left text-sm" onClick={() => {
          sequence.current++;
          const point = { lat: result.geometry.location.lat(), lng: result.geometry.location.lng() };
          if (!validPoint(point)) return;
          marker.current!.position = point; map.current!.panTo(point); map.current!.setZoom(16);
          setCandidate({ ...point, address: result.formatted_address }); setResults([]);
        }}>{result.formatted_address}</button></li>)}</ul>}
        <div ref={node} aria-label="Location map" className={`mt-3 h-[300px] w-full rounded-xl bg-[var(--surface-soft)] ${disabled ? 'pointer-events-none' : ''}`} />
        <p className="mt-2 text-sm text-[var(--text-secondary)]">Click the map to drop a pin, or drag the pin. Review it before using this location.</p>
        {searching && <p role="status">Looking up address…</p>}
        {candidate && <div className="mt-3"><p className="text-sm">{candidate.address || 'Enter the address manually after selecting this pin.'}</p><p className="text-xs text-[var(--text-secondary)]">{candidate.lat.toFixed(6)}, {candidate.lng.toFixed(6)}</p><button type="button" disabled={disabled || searching} onClick={() => { onSelect(candidate); setCandidate(undefined); }} className="min-h-12 text-[var(--accent-ink)]">Use this location</button></div>}
      </>}
    {error && <p role="alert" className="mt-2 text-sm text-[var(--critical)]">{error}</p>}
  </div>;
}
