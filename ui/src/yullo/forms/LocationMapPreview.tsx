import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, MapPin } from 'lucide-react';
import { googleMapLink, loadLocationMaps, mapsConfig, onMapsAuthFailure, validPoint, type MarkerInstance } from './googleLocationMaps';

export function LocationMapPreview({ name, address, latitude, longitude }: {
  name: string; address: string; latitude?: number | null; longitude?: number | null;
}) {
  const node = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(!mapsConfig.key);
  const point = typeof latitude === 'number' && typeof longitude === 'number' && validPoint({ lat: latitude, lng: longitude })
    ? { lat: latitude, lng: longitude } : undefined;
  const href = point ? googleMapLink(point) : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || name)}`;

  useEffect(() => {
    if (!mapsConfig.key || !node.current) return;
    let active = true;
    let marker: MarkerInstance | undefined;
    const fail = () => { if (active) setUnavailable(true); };
    const unsubscribe = onMapsAuthFailure(fail);
    // Load maps only when the bottom-of-page preview approaches the viewport.
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void loadLocationMaps().then(async sdk => {
        const center = point ?? await new sdk.Geocoder().geocode({ address: address || name }).then(({ results }) => {
          const location = results[0]?.geometry.location;
          return location ? { lat: location.lat(), lng: location.lng() } : undefined;
        });
        if (!active || !node.current) return;
        if (!center) { fail(); return; }
        const map = new sdk.Map(node.current, { center, zoom: 15, mapId: mapsConfig.mapId,
          disableDefaultUI: true, gestureHandling: 'none', keyboardShortcuts: false, clickableIcons: false });
        marker = new sdk.marker.AdvancedMarkerElement({ map, position: center, title: name });
      }).catch(fail);
    }, { rootMargin: '200px' });
    observer.observe(node.current);
    return () => { active = false; observer.disconnect(); unsubscribe(); if (marker) marker.map = null; };
  }, [latitude, longitude, address, name]);

  return <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Open ${name} in Google Maps`}
    className="relative block overflow-hidden rounded-lg border border-[var(--presentation-border,var(--border))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--presentation-accent,var(--accent))]">
    <div ref={node} aria-hidden="true" className={`${unavailable ? 'hidden' : ''} pointer-events-none h-28 bg-[var(--presentation-surface,var(--surface-soft))] sm:h-32`} />
    {unavailable && <div className="flex h-24 items-center justify-center gap-2 bg-[var(--presentation-surface,var(--surface-soft))] text-sm text-[var(--presentation-muted,var(--text-secondary))]"><MapPin size={18} aria-hidden="true" />View this location on Google Maps</div>}
    {!unavailable && <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-md border border-[var(--presentation-border,var(--border))] bg-[var(--presentation-surface,var(--surface))] px-2.5 py-1.5 text-xs font-medium text-[var(--presentation-text,var(--text-primary))]">Google Maps<ExternalLink size={12} aria-hidden="true" /></span>}
  </a>;
}
