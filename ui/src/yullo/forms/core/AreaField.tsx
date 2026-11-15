import { useId } from 'react';
import type { NearbyArea } from '../../api/nearby';
import { LocationSearchField } from '../LocationSearchField';
import type { LocationSelection } from '../googleLocationMaps';

export const areaFromSelection = (place: LocationSelection): NearbyArea => ({
  latitude: place.lat, longitude: place.lng, city: place.city || undefined,
  region: place.region || undefined, country_code: place.countryCode || undefined,
});

/** A manual area remains usable when map suggestions or location permissions are unavailable. */
export function AreaField({ value, onChange, showCity = true, coordinates = false, disabled = false, onResolvingChange }: {
  value: NearbyArea; onChange: (value: NearbyArea) => void; showCity?: boolean; coordinates?: boolean; disabled?: boolean;
  onResolvingChange?: (busy: boolean) => void;
}) {
  const id = useId();
  const field = 'mt-2 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline focus:outline-1 focus:outline-[var(--accent)] disabled:opacity-50';
  return <div className="space-y-4">
    {showCity && <LocationSearchField label="City or area" kind="city" countryCode={value.country_code || undefined} disabled={disabled}
      value={value.city || ''} onChange={city => onChange({ ...value, city: city || undefined, latitude: undefined, longitude: undefined })}
      onSelect={place => onChange(areaFromSelection(place))} onResolvingChange={onResolvingChange} />}
    <div className={`grid gap-4 ${showCity ? 'sm:grid-cols-2' : ''}`}>
      {showCity && <label htmlFor={`${id}-region`} className="text-sm font-medium">State / region <span className="font-normal text-[var(--text-secondary)]">(optional)</span><input id={`${id}-region`} value={value.region || ''} disabled={disabled} maxLength={120} className={field} onChange={event => onChange({ ...value, region: event.target.value || undefined })} /></label>}
      <label htmlFor={`${id}-country`} className="text-sm font-medium">Country code<input id={`${id}-country`} value={value.country_code || ''} disabled={disabled} autoComplete="country" placeholder="IN" maxLength={2} pattern="[A-Z]{2}" className={field} onChange={event => onChange({ ...value, country_code: event.target.value.toUpperCase().replace(/[^A-Z]/g, '') || undefined })} /><span className="mt-1 block text-xs font-normal text-[var(--text-secondary)]">Two letters, for example IN or BE.</span></label>
    </div>
    {coordinates && <div className="grid grid-cols-2 gap-4">{(['latitude', 'longitude'] as const).map(key => <label key={key} htmlFor={`${id}-${key}`} className="text-sm font-medium capitalize">{key}<input id={`${id}-${key}`} type="number" step="any" min={key === 'latitude' ? -90 : -180} max={key === 'latitude' ? 90 : 180} value={value[key] ?? ''} disabled={disabled} className={field} onChange={event => onChange({ ...value, [key]: Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : undefined })} /></label>)}</div>}
  </div>;
}
