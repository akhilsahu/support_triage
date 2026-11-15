import { useEffect, useState, type RefObject } from 'react';
import { loadLocationMaps, type BoundaryLayer, type MapInstance } from './googleLocationMaps';

export type BoundaryArea = { kind: 'city' | 'country'; city?: string; region?: string; countryCode?: string };

/** Highlight Google's actual administrative feature, never an approximate bounding box. */
export function useLocationBoundary(map: RefObject<MapInstance | undefined>, node: RefObject<HTMLDivElement>, ready: boolean, area?: BoundaryArea) {
  const [notice, setNotice] = useState('');
  const { kind, city, region, countryCode } = area || {};
  useEffect(() => {
    setNotice('');
    if (!ready || !kind || !countryCode || (kind === 'city' && !city)) return;
    let active = true;
    let layer: BoundaryLayer | undefined;
    let observer: MutationObserver | undefined;
    const unavailable = () => { if (active) setNotice('Boundary highlighting is unavailable for this area. Your selected area is unchanged.'); };
    void loadLocationMaps().then(async sdk => {
      const result = await new sdk.Geocoder().geocode({ address: [kind === 'city' ? city : null, kind === 'city' ? region : null, new Intl.DisplayNames(undefined, { type: 'region' }).of(countryCode)].filter(Boolean).join(', '), componentRestrictions: { country: countryCode } });
      if (!active || !map.current) return;
      const expectedType = kind === 'city' ? 'locality' : 'country';
      const feature = result.results.find(item => item.types?.includes(expectedType) && item.address_components?.some(part => part.types.includes('country') && part.short_name === countryCode));
      if (!feature?.place_id) { unavailable(); return; }
      if (feature.geometry.viewport) map.current.fitBounds?.(feature.geometry.viewport, 24);
      layer = map.current.getFeatureLayer?.(kind === 'city' ? 'LOCALITY' : 'COUNTRY');
      if (!layer?.isAvailable) { unavailable(); return; }
      const style = () => {
        if (!active || !layer) return;
        const color = node.current ? getComputedStyle(node.current).getPropertyValue('--accent-solid').trim() || '#fffc00' : '#fffc00';
        layer.style = ({ feature: candidate }) => candidate.placeId === feature.place_id
          ? { strokeColor: color, strokeWeight: 2, strokeOpacity: 1, fillColor: color, fillOpacity: 0.22 } : undefined;
      };
      style();
      observer = new MutationObserver(style);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-accent'] });
      const surface = node.current?.closest('.yullo-app');
      if (surface) observer.observe(surface, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-accent'] });
    }).catch(unavailable);
    return () => { active = false; observer?.disconnect(); if (layer) layer.style = null; };
  }, [ready, kind, city, region, countryCode, map, node]);
  return notice;
}
