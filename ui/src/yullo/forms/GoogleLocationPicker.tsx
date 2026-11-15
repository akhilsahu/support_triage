import React, { useEffect, useRef, useState } from 'react';
import { loadLocationMaps, mapsConfig, validPoint, geocodeArea, onMapsAuthFailure, type MapInstance, type CircleInstance, type MarkerInstance, type Point, type LocationSelection } from './googleLocationMaps';

import { useLocationBoundary, type BoundaryArea } from './googleLocationBoundary';

export type MapLookupState = 'idle' | 'loading' | 'resolved' | 'failed';

export function GoogleLocationPicker({ initialPoint, disabled, onSelect, revision = 0, autoResolvePoint, onAutoSelect, pinNeedsUpdate = false, compact = false, radiusKm, onLookupStateChange, boundaryArea, worldwide = false }: {
  boundaryArea?: BoundaryArea; worldwide?: boolean;
  initialPoint?: Point; disabled: boolean; onSelect: (selection: LocationSelection) => void; revision?: number;
  autoResolvePoint?: Point; onAutoSelect?: (selection: LocationSelection) => void;
  pinNeedsUpdate?: boolean; compact?: boolean; radiusKm?: number; onLookupStateChange?: (state: MapLookupState) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance>();
  const marker = useRef<MarkerInstance>();
  const sequence = useRef(0);
  const circle = useRef<CircleInstance>();
  const radiusRef = useRef(radiusKm);
  radiusRef.current = radiusKm;
  const syncCircle = useRef<(fit?: boolean) => void>();
  const lookupRef = useRef(onLookupStateChange);
  lookupRef.current = onLookupStateChange;
  const onSelectRef = useRef(onSelect);
  const autoSelectRef = useRef(onAutoSelect);
  const autoPointRef = useRef(autoResolvePoint);
  const autoApplied = useRef(false);
  const pickRef = useRef<(point: Point, automatic?: boolean) => Promise<void>>();
  const worldwideRef = useRef(worldwide);
  worldwideRef.current = worldwide;
  const disabledRef = useRef(disabled);
  onSelectRef.current = onSelect; disabledRef.current = disabled;
  autoSelectRef.current = onAutoSelect; autoPointRef.current = autoResolvePoint;
  const [mapReady, setMapReady] = useState(false);
  const boundaryNotice = useLocationBoundary(map, node, mapReady, boundaryArea);
  const [mapFailed, setMapFailed] = useState(false);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const startingPoint = useRef(initialPoint);
  startingPoint.current = initialPoint;
  const resolveCurrentPoint = () => {
    if (worldwideRef.current || autoApplied.current || !autoPointRef.current || !pickRef.current || disabledRef.current) return;
    autoApplied.current = true;
    void pickRef.current(autoPointRef.current, true);
  };

  useEffect(() => {
    if (!mapsConfig.key) { lookupRef.current?.('failed'); return; }
    let active = true;
    let failed = false;
    const listeners: { remove(): void }[] = [];
    const failMap = () => {
      if (!active) return;
      failed = true; sequence.current++;
      listeners.forEach(listener => listener.remove());
      if (marker.current) marker.current.map = null;
      circle.current?.setMap(null); syncCircle.current = undefined;
      map.current = undefined;
      setMapReady(false); setMapFailed(true); setSearching(false); lookupRef.current?.('failed');
      setError('Google Maps is unavailable for this site. You can still enter the address details.');
    };
    const unsubscribeAuth = onMapsAuthFailure(failMap);
    loadLocationMaps().then(sdk => {
      if (!active || failed || !node.current) return;
      const initial = startingPoint.current;
      map.current = new sdk.Map(node.current, { center: initial || { lat: 0, lng: 0 }, zoom: initial ? 16 : 2, mapId: mapsConfig.mapId, gestureHandling: 'cooperative', streetViewControl: false, mapTypeControl: false });
      marker.current = new sdk.marker.AdvancedMarkerElement({ map: map.current, position: initial, gmpDraggable: true, title: 'Selected location — drag to adjust' });
      syncCircle.current = (fit = true) => {
        const point = startingPoint.current;
        const radius = radiusRef.current;
        if (!point || !validPoint(point) || !radius || !sdk.Circle) { circle.current?.setMap(null); return; }
        const color = node.current ? getComputedStyle(node.current).getPropertyValue('--accent-solid').trim() || '#fffc00' : '#fffc00';
        circle.current ??= new sdk.Circle({});
        circle.current.setMap(map.current!);
        circle.current.setOptions({ center: point, radius: radius * 1000, clickable: false,
          strokeColor: color, strokeOpacity: 1, strokeWeight: 2, fillColor: color, fillOpacity: 0.15 });
        const bounds = circle.current.getBounds();
        if (fit && bounds) map.current?.fitBounds?.(bounds, 24);
      };
      syncCircle.current();
      setMapReady(true);
      const pick = async (point: Point, automatic = false) => {
        if (worldwideRef.current || disabledRef.current || !validPoint(point)) return;
        const request = ++sequence.current;
        marker.current!.position = point;
        setSearching(true); setError(''); lookupRef.current?.('loading');
        // Pin selection changes only the draft; Save location persists it.
        const select = automatic ? autoSelectRef.current || onSelectRef.current : onSelectRef.current;
        select(point);
        try {
          const response = await new sdk.Geocoder().geocode({ location: point });
          if (active && request === sequence.current && !disabledRef.current && !worldwideRef.current) {
            const result = response.results[0];
            if (result) {
              select({ ...point, address: result.formatted_address,
                name: result.formatted_address.split(',')[0], ...geocodeArea(result) });
              lookupRef.current?.('resolved');
            } else { setError('No address found for this pin. Enter the address details.'); lookupRef.current?.('failed'); }
          }
        } catch { if (active && request === sequence.current) { setError('Address lookup failed. Enter the address details for this pin.'); lookupRef.current?.('failed'); } }
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
    const colors = new MutationObserver(() => syncCircle.current?.(false));
    colors.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-accent'] });
    const surface = node.current?.closest('.yullo-app');
    if (surface) colors.observe(surface, { attributes: true, attributeFilter: ['style', 'class', 'data-theme', 'data-accent'] });
    return () => { active = false; unsubscribeAuth(); colors.disconnect(); circle.current?.setMap(null); syncCircle.current = undefined; sequence.current++; pickRef.current = undefined; listeners.forEach(listener => listener.remove()); if (marker.current) marker.current.map = null; map.current = undefined; };
  }, []);

  const lat = initialPoint?.lat, lng = initialPoint?.lng;
  useEffect(() => { sequence.current++; setSearching(false); if (worldwide) lookupRef.current?.('idle'); }, [revision, worldwide]);
  useEffect(() => { resolveCurrentPoint(); }, [autoResolvePoint?.lat, autoResolvePoint?.lng, disabled]);
  useEffect(() => {
    const point = lat !== undefined && lng !== undefined ? { lat, lng } : undefined;
    if (marker.current) { marker.current.position = point; marker.current.map = worldwide ? null : map.current || null; }
    if (map.current && point && !worldwide) { map.current.panTo(point); if (!radiusRef.current) map.current.setZoom(16); }
  }, [lat, lng, worldwide, mapReady]);
  useEffect(() => { syncCircle.current?.(); }, [lat, lng, radiusKm]);

  useEffect(() => {
    if (mapReady && worldwide) map.current?.fitBounds?.({ north: 85, south: -85, east: 180, west: -180 }, 0);
  }, [worldwide, mapReady]);

  return <div className={compact ? 'space-y-2' : 'mb-6 border-b border-[var(--border)] pb-5'}>
    {!mapsConfig.key ? <p className="text-sm text-[var(--text-secondary)]">Map selection is not configured yet. You can enter the address details.</p> : <>
      <div ref={node} aria-label={worldwide ? 'Worldwide reach map' : 'Location map'} className={`${mapFailed ? 'hidden' : ''} ${compact ? 'h-[160px]' : 'h-[260px]'} w-full rounded-xl bg-[var(--surface-soft)] ${disabled ? 'pointer-events-none' : ''}`} />
      {!mapFailed && <p className="mt-2 text-sm text-[var(--text-secondary)]">{worldwide ? 'Worldwide reach · People everywhere can discover this page.' : pinNeedsUpdate ? 'Choose an address suggestion or move the pin to update its location.' : 'Select an address above, click the map, or drag the pin. Details fill in automatically.'}</p>}
      {searching && <p role="status" className="mt-2 text-sm">Filling address details…</p>}
    </>}
    {boundaryNotice && <p role="status" className="text-xs text-[var(--text-secondary)]">{boundaryNotice}</p>}
    {error && <p role="alert" className="mt-2 text-sm text-[var(--critical)]">{error}</p>}
  </div>;
}
