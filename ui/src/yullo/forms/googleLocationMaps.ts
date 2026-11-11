// Small typed boundary around the browser SDK; loaded only when the owner opens the map.
export type Point = { lat: number; lng: number };
export type LatLng = { lat(): number; lng(): number };
type Listener = { remove(): void };
export type MapInstance = { panTo(point: Point): void; setZoom(zoom: number): void; addListener(event: string, callback: (event: { latLng?: LatLng }) => void): Listener };
export type MarkerInstance = { position?: Point | LatLng; map: MapInstance | null; addListener(event: string, callback: () => void): Listener };
export type GeocodeResult = { formatted_address: string; geometry: { location: LatLng } };
export type GoogleMaps = {
  Map: new (node: HTMLElement, options: Record<string, unknown>) => MapInstance;
  marker: { AdvancedMarkerElement: new (options: Record<string, unknown>) => MarkerInstance };
  Geocoder: new () => { geocode(request: { address?: string; location?: Point }): Promise<{ results: GeocodeResult[] }> };
};
type MapsWindow = Window & { google?: { maps: GoogleMaps }; __yulloMapsReady?: () => void };
let loading: Promise<GoogleMaps> | undefined;
export const mapsConfig = {
  key: import.meta.env.VITE_YULLO_GOOGLE_MAPS_API_KEY || '',
  mapId: import.meta.env.VITE_YULLO_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
};
export function loadLocationMaps(): Promise<GoogleMaps> {
  const target = window as MapsWindow;
  if (target.google?.maps?.marker) return Promise.resolve(target.google.maps);
  if (loading) return loading;
  if (!mapsConfig.key) return Promise.reject(new Error('Maps not configured'));
  loading = new Promise<GoogleMaps>((resolve, reject) => {
    const script = document.createElement('script');
    let finished = false;
    const finish = (failed: boolean) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      if (failed || !target.google?.maps?.marker) {
        script.remove(); loading = undefined;
        reject(new Error('Google Maps unavailable'));
      } else resolve(target.google.maps);
    };
    const timer = window.setTimeout(() => finish(true), 15000);
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
