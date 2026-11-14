import React, { useEffect, useRef, useState } from 'react';
import { loadLocationMaps, mapsConfig, validPoint, geocodeArea, onMapsAuthFailure, type MapInstance, type MarkerInstance, type Point, type LocationSelection } from './googleLocationMaps';

export function GoogleLocationPicker({ initialPoint, disabled, onSelect, revision = 0, autoResolvePoint, onAutoSelect, pinNeedsUpdate = false }: {
  initialPoint?: Point; disabled: boolean; onSelect: (selection: LocationSelection) => void; revision?: number;
  autoResolvePoint?: Point; onAutoSelect?: (selection: LocationSelection) => void;
  pinNeedsUpdate?: boolean;
}) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance>();
  const marker = useRef<MarkerInstance>();
  const sequence = useRef(0);
  const onSelectRef = useRef(onSelect);
  const autoSelectRef = useRef(onAutoSelect);
  const autoPointRef = useRef(autoResolvePoint);
  const autoApplied = useRef(false);
  const pickRef = useRef<(point: Point, automatic?: boolean) => Promise<void>>();
  const disabledRef = useRef(disabled);
  onSelectRef.current = onSelect; disabledRef.current = disabled;
  autoSelectRef.current = onAutoSelect; autoPointRef.current = autoResolvePoint;
  const [mapFailed, setMapFailed] = useState(false);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const startingPoint = useRef(initialPoint);
  startingPoint.current = initialPoint;
  const resolveCurrentPoint = () => {
    if (autoApplied.current || !autoPointRef.current || !pickRef.current || disabledRef.current) return;
    autoApplied.current = true;
    void pickRef.current(autoPointRef.current, true);
  };

  useEffect(() => {
    if (!mapsConfig.key) return;
    let active = true;
    let failed = false;
    const listeners: { remove(): void }[] = [];
    const failMap = () => {
      if (!active) return;
      failed = true; sequence.current++;
      listeners.forEach(listener => listener.remove());
      if (marker.current) marker.current.map = null;
      map.current = undefined;
      setMapFailed(true); setSearching(false);
      setError('Google Maps is unavailable for this site. You can still enter the address details.');
    };
    const unsubscribeAuth = onMapsAuthFailure(failMap);
    loadLocationMaps().then(sdk => {
      if (!active || failed || !node.current) return;
      const initial = startingPoint.current;
      map.current = new sdk.Map(node.current, { center: initial || { lat: 0, lng: 0 }, zoom: initial ? 16 : 2, mapId: mapsConfig.mapId, gestureHandling: 'cooperative', streetViewControl: false, mapTypeControl: false });
      marker.current = new sdk.marker.AdvancedMarkerElement({ map: map.current, position: initial, gmpDraggable: true, title: 'Selected location — drag to adjust' });
      const pick = async (point: Point, automatic = false) => {
        if (disabledRef.current || !validPoint(point)) return;
        const request = ++sequence.current;
        marker.current!.position = point;
        setSearching(true); setError('');
        // Pin selection changes only the draft; Save location persists it.
        const select = automatic ? autoSelectRef.current || onSelectRef.current : onSelectRef.current;
        select(point);
        try {
          const response = await new sdk.Geocoder().geocode({ location: point });
          if (active && request === sequence.current && !disabledRef.current) {
            const result = response.results[0];
            if (result) select({ ...point, address: result.formatted_address,
              name: result.formatted_address.split(',')[0], ...geocodeArea(result) });
            else setError('No address found for this pin. Enter the address details.');
          }
        } catch { if (active && request === sequence.current) setError('Address lookup failed. Enter the address details for this pin.'); }
        finally { if (active && request === sequence.current) setSearching(false); }
      };
      pickRef.current = pick;
      listeners.push(map.current.addListener('click', event => { if (event.latLng) void pick({ lat: event.latLng.lat(), lng: event.latLng.lng() }); }));
      listeners.push(marker.current.addListener('dragend', () => {
        const position = marker.current?.position;
        if (!position) return;
        void pick(typeof position.lat === 'function' ? { lat: position.lat(), lng: (position as { lng(): number }).lng() } : position as Point);
      }));
      resolveCurrentPoint();
    }).catch(failMap);
    return () => { active = false; unsubscribeAuth(); sequence.current++; pickRef.current = undefined; listeners.forEach(listener => listener.remove()); if (marker.current) marker.current.map = null; map.current = undefined; };
  }, []);

  const lat = initialPoint?.lat, lng = initialPoint?.lng;
  useEffect(() => { sequence.current++; setSearching(false); }, [revision]);
  useEffect(() => { resolveCurrentPoint(); }, [autoResolvePoint?.lat, autoResolvePoint?.lng, disabled]);
  useEffect(() => {
    const point = lat !== undefined && lng !== undefined ? { lat, lng } : undefined;
    if (marker.current) marker.current.position = point;
    if (map.current && point) { map.current.panTo(point); map.current.setZoom(16); }
  }, [lat, lng]);

  return <div className="mb-6 border-b border-[var(--border)] pb-5">
    {!mapsConfig.key ? <p className="text-sm text-[var(--text-secondary)]">Map selection is not configured yet. You can enter the address details.</p> : <>
      <div ref={node} aria-label="Location map" className={`${mapFailed ? 'hidden' : ''} h-[260px] w-full rounded-xl bg-[var(--surface-soft)] ${disabled ? 'pointer-events-none' : ''}`} />
      {!mapFailed && <p className="mt-2 text-sm text-[var(--text-secondary)]">{pinNeedsUpdate ? 'Choose an address suggestion or move the pin to update its location.' : 'Select an address above, click the map, or drag the pin. Details fill in automatically.'}</p>}
      {searching && <p role="status" className="mt-2 text-sm">Filling address details…</p>}
    </>}
    {error && <p role="alert" className="mt-2 text-sm text-[var(--critical)]">{error}</p>}
  </div>;
}
