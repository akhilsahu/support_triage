// Small typed boundary around the browser SDK; loaded only when the owner opens the map.
export type Point = { lat: number; lng: number };
export type LatLng = { lat(): number; lng(): number };
type Listener = { remove(): void };
export type MapInstance = { panTo(point: Point): void; setZoom(zoom: number): void; addListener(event: string, callback: (event: { latLng?: LatLng }) => void): Listener };
export type MarkerInstance = { position?: Point | LatLng; map: MapInstance | null; addListener(event: string, callback: () => void): Listener };
export type GeocodeResult = { formatted_address: string; geometry: { location: LatLng }; address_components?: { long_name: string; short_name: string; types: string[] }[] };
export function geocodeArea(result?: GeocodeResult): { city?: string; region?: string; countryCode?: string; postalCode?: string } {
  const parts = result?.address_components ?? [];
  const city = parts.find(part => part.types.includes('locality')) ?? parts.find(part => part.types.includes('postal_town'));
  const postal = parts.find(part => part.types.includes('postal_code'))?.long_name;
  const suffix = parts.find(part => part.types.includes('postal_code_suffix'))?.long_name;
  return { city: city?.long_name, region: parts.find(part => part.types.includes('administrative_area_level_1'))?.long_name,
    countryCode: parts.find(part => part.types.includes('country'))?.short_name,
    postalCode: postal ? postal + (suffix ? `-${suffix}` : '') : undefined };
}
export type LocationSelection = Point & ReturnType<typeof geocodeArea> & { address?: string; name?: string };
export type GoogleMaps = {
  importLibrary?: (name: string) => Promise<unknown>;
  Map: new (node: HTMLElement, options: Record<string, unknown>) => MapInstance;
  marker: { AdvancedMarkerElement: new (options: Record<string, unknown>) => MarkerInstance };
  Geocoder: new () => { geocode(request: { address?: string; location?: Point }): Promise<{ results: GeocodeResult[] }> };
};
type MapsWindow = Window & { google?: { maps: GoogleMaps }; __yulloMapsReady?: () => void; gm_authFailure?: () => void };
let loading: Promise<GoogleMaps> | undefined;
let authFailed = false;
let authHandlerInstalled = false;
const authFailureListeners = new Set<() => void>();

export function onMapsAuthFailure(listener: () => void): () => void {
  const target = window as MapsWindow;
  if (!authHandlerInstalled) {
    const previous = target.gm_authFailure;
    target.gm_authFailure = () => {
      authFailed = true;
      loading = undefined;
      for (const notify of authFailureListeners) notify();
      previous?.();
    };
    authHandlerInstalled = true;
  }
  authFailureListeners.add(listener);
  if (authFailed) listener();
  return () => { authFailureListeners.delete(listener); };
}
export const mapsConfig = {
  key: import.meta.env.VITE_YULLO_GOOGLE_MAPS_API_KEY || '',
  mapId: import.meta.env.VITE_YULLO_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
};
export function loadLocationMaps(): Promise<GoogleMaps> {
  const target = window as MapsWindow;
  if (authFailed) return Promise.reject(new Error('Google Maps authorization failed'));
  if (target.google?.maps?.marker) return Promise.resolve(target.google.maps);
  if (loading) return loading;
  if (!mapsConfig.key) return Promise.reject(new Error('Maps not configured'));
  loading = new Promise<GoogleMaps>((resolve, reject) => {
    const script = document.createElement('script');
    let finished = false;
    let unsubscribe = () => {};
    const finish = (failed: boolean) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      unsubscribe();
      if (failed || !target.google?.maps?.marker) {
        script.remove(); loading = undefined;
        reject(new Error('Google Maps unavailable'));
      } else resolve(target.google.maps);
    };
    const timer = window.setTimeout(() => finish(true), 15000);
    unsubscribe = onMapsAuthFailure(() => finish(true));
    target.__yulloMapsReady = () => finish(false);
    script.onerror = () => finish(true);
    const params = new URLSearchParams({ key: mapsConfig.key, v: 'quarterly', loading: 'async', libraries: 'marker', callback: '__yulloMapsReady' });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    document.head.appendChild(script);
  });
  return loading;
}
export function validPoint(point: Point): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
}
export function googleMapLink(point: Point): string {
  return `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`;
}
