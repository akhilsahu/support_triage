import React, { useEffect, useId, useRef, useState } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { loadLocationPlaces, selectLocationPrediction, type PlacePrediction } from './googleLocationPlaces';
import { mapsConfig, type LocationSelection } from './googleLocationMaps';

/** Native searchable dropdown shared by address, city and state; manual entry always works. */
export function LocationSearchField({ id, label, value, onChange, onSelect, kind = 'address', countryCode, disabled, error, registration, onResolvingChange, savedSuggestions = [] }: {
  id?: string; label: string; value: string; onChange: (value: string) => void;
  onSelect: (selection: LocationSelection) => void; kind?: 'address' | 'city' | 'region' | 'country';
  countryCode?: string; disabled?: boolean; error?: string;
  savedSuggestions?: { label: string; value: string; selection: LocationSelection }[];
  registration?: UseFormRegisterReturn;
  onResolvingChange?: (busy: boolean) => void;
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [focused, setFocused] = useState(false);
  const [edited, setEdited] = useState(false);
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const sequence = useRef(0);
  const detailSequence = useRef(0);
  const session = useRef<object>();
  const selecting = useRef(false);
  const onSelectRef = useRef(onSelect);
  const resolvingRef = useRef(onResolvingChange);
  resolvingRef.current = onResolvingChange;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  onSelectRef.current = onSelect;

  useEffect(() => {
    const request = ++sequence.current;
    setSuggestions([]); if (!selecting.current) setLoading(false);
    if (!focused || !edited || disabled || selecting.current || !mapsConfig.key || value.trim().length < 2) return;
    const timer = window.setTimeout(async () => {
      setLoading(true); setMessage('');
      try {
        const places = await loadLocationPlaces();
        if (request !== sequence.current) return;
        session.current ??= new places.AutocompleteSessionToken();
        const response = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: value.trim(), sessionToken: session.current,
          ...(kind === 'city' ? { includedPrimaryTypes: ['locality', 'postal_town', 'administrative_area_level_3'] } : kind === 'country' ? { includedPrimaryTypes: ['country'] } : kind === 'region' ? { includedPrimaryTypes: ['administrative_area_level_1'] } : {}),
          ...(/^[A-Z]{2}$/.test(countryCode || '') ? { includedRegionCodes: [countryCode!.toLowerCase()] } : {}),
        });
        if (request === sequence.current) setSuggestions(response.suggestions.flatMap(item => item.placePrediction ? [item.placePrediction] : []));
      } catch { if (request === sequence.current) setMessage('Suggestions are unavailable. You can enter the details manually.'); }
      finally { if (request === sequence.current) setLoading(false); }
    }, 250);
    return () => { window.clearTimeout(timer); sequence.current++; };
  }, [value, focused, edited, disabled, kind, countryCode]);

  useEffect(() => () => { sequence.current++; detailSequence.current++; resolvingRef.current?.(false); }, []);

  const change = async (next: string) => {
    const prediction = suggestions.find(item => item.text.toString() === next);
    const request = ++detailSequence.current;
    sequence.current++; setLoading(false); setMessage('');
    resolvingRef.current?.(false);
    onChange(next);
    const saved = savedSuggestions.find(item => item.value === next);
    if (saved) {
      selecting.current = false; setEdited(false); setSuggestions([]);
      onSelectRef.current(saved.selection);
      return;
    }
    if (!prediction) { selecting.current = false; setEdited(true); return; }
    selecting.current = true; setEdited(false); setSuggestions([]); setLoading(true);
    resolvingRef.current?.(true);
    try {
      const selection = await selectLocationPrediction(prediction);
      if (request === detailSequence.current && !disabledRef.current) onSelectRef.current(selection);
    } catch { if (request === detailSequence.current) setMessage('Could not fill this address. You can enter the details manually.'); }
    finally {
      session.current = undefined;
      if (request === detailSequence.current) { selecting.current = false; setLoading(false); resolvingRef.current?.(false); }
    }
  };
  return <div className="mb-5 min-w-0">
    <label htmlFor={inputId} className="mb-2 block text-sm font-medium">{label}</label>
    <input ref={registration?.ref} id={inputId} name={registration?.name || kind} value={value} list={`${inputId}-suggestions`} disabled={disabled}
      autoComplete={kind === 'country' ? 'country-name' : kind === 'address' ? 'street-address' : kind === 'city' ? 'address-level2' : 'address-level1'}
      maxLength={kind === 'address' ? 1000 : 120} onFocus={() => { setFocused(true); if (kind !== 'address') setEdited(true); }}
      onBlur={event => { setFocused(false); setEdited(false); session.current = undefined; void registration?.onBlur(event); }} onChange={event => void change(event.target.value)}
      aria-invalid={!!error} aria-describedby={`${inputId}-status`}
      className="min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 text-base text-[var(--text-primary)] focus:border-[var(--accent,var(--accent-solid))] focus:outline-[var(--focus)] disabled:opacity-50" />
    <datalist id={`${inputId}-suggestions`}>
      {savedSuggestions.map(item => <option key={item.value} value={item.value} label={item.label} />)}
      {suggestions.filter(item => !savedSuggestions.some(saved => saved.value === item.text.toString())).map(item => <option key={item.placeId} value={item.text.toString()} />)}
    </datalist>
    {!!suggestions.length && <span translate="no" className="mt-1 inline-block rounded bg-white px-2 text-xs font-normal not-italic tracking-normal text-[#1f1f1f]">Google Maps</span>}
    <p id={`${inputId}-status`} role={error ? 'alert' : 'status'} className={`mt-2 text-sm ${error ? 'text-[var(--critical)]' : 'text-[var(--text-secondary)]'}`}>{error || (loading ? 'Finding places…' : message)}</p>
  </div>;
}
