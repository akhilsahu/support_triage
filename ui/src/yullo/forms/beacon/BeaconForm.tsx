import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, useReducedMotion } from 'motion/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { CalendarClock, Check, Globe2, MapPin, Pause, Radio, X } from 'lucide-react';
import { beaconKey, beaconReaches, isNearbyReach, saveBeacon, useBeacon, type BeaconReach, type BeaconState } from '../../api/beacon';
import type { NearbyArea } from '../../api/nearby';
import type { SpaceEntity } from '../../api/entities';
import { useYulloAppStore } from '../../store/useYulloAppStore';
import { YulloButton } from '../../components/core/YulloButton';
import { IconTooltip } from '../core/IconTooltip';
import { DateTimeField } from '../core/DateTimeField';
import { AreaField, areaFromSelection } from '../core/AreaField';
import { GoogleLocationPicker, type MapLookupState } from '../GoogleLocationPicker';
import { LocationSearchField } from '../LocationSearchField';
import { mapsConfig, type LocationSelection, type Point } from '../googleLocationMaps';

function countryName(code?: string | null) {
  return code && /^[A-Z]{2}$/.test(code) ? new Intl.DisplayNames(undefined, { type: 'region' }).of(code) : code;
}

function areaName(area: NearbyArea, reach: BeaconReach) {
  return [reach !== 'country' ? area.city : null, reach !== 'country' ? area.region : null, countryName(area.country_code)].filter(Boolean).join(', ');
}

function localParts(value?: string | null) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return { date: '', time: '' };
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

export function BeaconControl(props: { spaceId: string; title: string; cover?: string | null; locations: SpaceEntity[] }) {
  const ownerId = useYulloAppStore(state => state.user?.id);
  return ownerId ? <BeaconEntry key={`${ownerId}:${props.spaceId}`} {...props} ownerId={ownerId} /> : null;
}

function BeaconEntry({ spaceId, title, cover, locations, ownerId }: { spaceId: string; title: string; cover?: string | null; locations: SpaceEntity[]; ownerId: string }) {
  const [open, setOpen] = useState(false);
  const query = useBeacon(spaceId);
  const active = query.data?.status === 'active' && new Date(query.data.config?.expires_at || 0).getTime() > Date.now();
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <IconTooltip label={active ? 'Beacon is active · Manage reach' : 'Beacon · Share this page in Nearby'}>
      <Dialog.Trigger asChild><YulloButton variant="outline" size="icon" aria-label="Open Beacon settings" className="relative bg-[linear-gradient(135deg,var(--accent-soft),var(--surface))]"><Radio size={19} strokeWidth={2} aria-hidden="true" />{active && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface)] bg-[var(--accent-ink)]" />}</YulloButton></Dialog.Trigger>
    </IconTooltip>
    {open && <BeaconEditor spaceId={spaceId} title={title} cover={cover} locations={locations} ownerId={ownerId} close={() => setOpen(false)} />}
  </Dialog.Root>;
}

function BeaconEditor({ spaceId, title, cover, locations, ownerId, close }: { spaceId: string; title: string; cover?: string | null; locations: SpaceEntity[]; ownerId: string; close: () => void }) {
  const reduced = useReducedMotion();
  const query = useBeacon(spaceId);
  const client = useQueryClient();
  const hydrated = useRef(false);
  const [reach, setReach] = useState<BeaconReach>('nearby');
  const [radiusKm, setRadiusKm] = useState(10);
  const [search, setSearch] = useState('');
  const [lookup, setLookup] = useState<MapLookupState>(mapsConfig.key ? 'idle' : 'failed');
  const [resolvePoint, setResolvePoint] = useState<Point>();
  const [mapSeed, setMapSeed] = useState(0);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [area, setArea] = useState<NearbyArea>({});
  const [locationId, setLocationId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState('');
  const [resolving, setResolving] = useState(false);
  const savedLocations = locations.filter(item => item.entity_type === 'location' && item.is_active && !item.payload_json.is_remote && ['owner_confirmed', 'source_authoritative'].includes(item.review_status));
  const locationSuggestions = [...savedLocations].sort((a, b) => Number(b.identity_key === 'event-venue') - Number(a.identity_key === 'event-venue')).flatMap(item => {
    const value = item.payload_json;
    if (value.latitude == null || value.longitude == null) return [];
    const address = areaName(value, reach) || value.address || value.name;
    if (!address) return [];
    return [{ label: item.identity_key === 'event-venue' ? 'Event location' : value.name || 'Saved location', value: address,
      selection: { lat: value.latitude, lng: value.longitude, address, city: value.city, region: value.region, countryCode: value.country_code } }];
  }).filter((item, index, all) => all.findIndex(other => other.value === item.value) === index);
  const load = (state: BeaconState) => {
    setReach(state.config?.reach || 'nearby');
    setRadiusKm(state.config?.radius_km ?? 10);
    const savedLocation = savedLocations.find(item => item.identity_key === 'event-venue') || savedLocations[0];
    const payload = savedLocation?.payload_json;
    const initial: NearbyArea = state.config?.target_area || (payload?.latitude != null && payload?.longitude != null ? {
      latitude: payload.latitude, longitude: payload.longitude, city: payload.city, region: payload.region, country_code: payload.country_code,
    } : {});
    setArea(initial);
    setSearch(areaName(initial, state.config?.reach || 'nearby'));
    setLocationId(state.config?.origin_location_entity_id || '');
    setLookup(mapsConfig.key ? 'idle' : 'failed');
    setResolvePoint(initial.latitude != null && initial.longitude != null && (!initial.city || !initial.country_code)
      ? { lat: initial.latitude, lng: initial.longitude } : undefined);
    const parts = localParts(state.config?.expires_at || state.default_expires_at);
    setDate(parts.date); setTime(parts.time); setRevision(state.revision);
    setConflict(false); setError(''); hydrated.current = true;
  };
  useEffect(() => { if (query.data && !hydrated.current) load(query.data); }, [query.data]);
  const mutation = useMutation({
    mutationFn: async (pause: boolean) => {
      const expiry = new Date(`${date}T${time}`);
      if (!pause && (!date || !time || Number.isNaN(expiry.getTime()))) throw new Error('Choose an expiry date and time.');
      return saveBeacon(ownerId, spaceId, revision, pause ? undefined : {
        reach, radius_km: isNearbyReach(reach) && !(reach === 'nearby_5' && stateLegacyRadius()) ? radiusKm : undefined,
        target_area: reach === 'worldwide' ? {} : area,
        origin_location_entity_id: reach === 'worldwide' ? null : locationId || null,
        expires_at: expiry.toISOString(),
      });
    },
    onSuccess: state => {
      if (useYulloAppStore.getState().user?.id !== ownerId) return;
      client.setQueryData(beaconKey(ownerId, spaceId), state);
      void client.invalidateQueries({ queryKey: ['yullo-nearby', ownerId] });
      load(state); setNotice(state.status === 'active' ? 'Beacon is active. People in your chosen area can find this page in Nearby.' : 'Beacon paused.');
    },
    onError: failure => {
      if (useYulloAppStore.getState().user?.id !== ownerId) return;
      const detail = isAxiosError(failure) ? failure.response?.data?.detail : null;
      setConflict(isAxiosError(failure) && failure.response?.status === 409);
      setError(typeof detail === 'string' ? detail : failure instanceof Error && !isAxiosError(failure) ? failure.message : 'Could not save Beacon. Check the target area and expiry, then try again.');
    },
  });
  const stateLegacyRadius = () => query.data?.config?.reach === 'nearby_5' && query.data.config.radius_km == null;
  const nearby = isNearbyReach(reach);
  const legacyFive = reach === 'nearby_5' && stateLegacyRadius();
  const effectiveRadius = legacyFive ? 5 : radiusKm;
  const busy = mutation.isPending;
  const targetLabel = reach === 'worldwide' ? 'Worldwide' : nearby ? `Within ${effectiveRadius} km of your pin` : [reach === 'city' ? area.city : null, area.country_code].filter(Boolean).join(', ') || 'Choose an area';
  const updateArea = (value: NearbyArea) => { setArea(value); setLocationId(''); setNotice(''); };
  const selectPoint = (place: LocationSelection) => {
    updateArea(areaFromSelection(place));
    setSearch(areaName(areaFromSelection(place), reach) || place.address || '');
  };
  const country = countryName(area.country_code);
  const areaLabel = [area.city, area.region, country].filter(Boolean).join(', ');
  const point = area.latitude != null && area.longitude != null ? { lat: area.latitude, lng: area.longitude } : undefined;
  const expiry = date && time ? new Date(`${date}T${time}`) : null;
  const expiryValid = expiry && !Number.isNaN(expiry.getTime()) && expiry.getTime() > Date.now() && (!query.data?.latest_expires_at || expiry.getTime() <= new Date(query.data.latest_expires_at).getTime());
  const targetValid = reach === 'worldwide' || (nearby ? area.latitude != null && area.longitude != null : /^[A-Z]{2}$/.test(area.country_code || '') && (reach !== 'city' || !!area.city));
  return <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/40" onPointerDown={event => { if (busy) event.preventDefault(); }} />
    <Dialog.Content asChild onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}>
      <motion.section initial={reduced ? false : { x: 16, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: reduced ? 0 : 0.2, ease: 'easeOut' }} className="yullo-app fixed inset-y-0 right-0 z-[101] flex h-[100dvh] w-full max-w-[640px] flex-col border-l border-[var(--border)] bg-[var(--canvas)] text-[var(--text-primary)] shadow-2xl outline-none sm:rounded-l-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
          <div><Dialog.Title className="flex items-center gap-2 text-xl font-semibold"><Radio size={21} className="text-[var(--accent-ink)]" />Beacon</Dialog.Title><Dialog.Description className="mt-1 text-sm text-[var(--text-secondary)]">Put this page on the map. Choose who can find it.</Dialog.Description></div>
          <IconTooltip label="Close Beacon"><YulloButton variant="ghost" size="icon" disabled={busy} onClick={close} aria-label="Close Beacon"><X size={19} /></YulloButton></IconTooltip>
        </header>
        {query.isPending ? <p role="status" className="p-6">Loading Beacon…</p> : query.isError ? <div role="alert" className="space-y-3 p-6"><p>Beacon is unavailable right now.</p><YulloButton variant="outline" onClick={() => void query.refetch()}>Try again</YulloButton></div> : <form className="flex min-h-0 flex-1 flex-col" onSubmit={event => { event.preventDefault(); setError(''); setNotice(''); if (!busy && (reach === 'worldwide' || (!resolving && lookup !== 'loading')) && !conflict && expiryValid && targetValid) mutation.mutate(false); }}>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
            <div className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-[minmax(0,1fr)_120px]">
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2">
                  {cover && <img src={cover} alt="" className="h-8 w-10 shrink-0 rounded border border-[var(--border)] bg-[var(--surface-soft)] object-contain" />}
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">{query.data?.status === 'active' ? 'Active in Nearby' : 'Your Beacon'}</p>
                </div>
                <h3 className="break-words text-lg font-semibold leading-snug">{title}</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{targetLabel}</p>
              </div>
              <div key={`${busy}:${query.data?.status}`} aria-hidden="true" className="yullo-beacon-radar pointer-events-none relative aspect-square w-full overflow-hidden rounded-full">
                <span className="yullo-beacon-sweep absolute inset-1 rounded-full" />
                <svg viewBox="0 0 128 128" className="relative h-full w-full fill-none" stroke="currentColor" strokeWidth="0.7">
                  {[20, 39, 59].map(radius => <circle key={radius} cx="64" cy="64" r={radius} opacity={radius === 59 ? 0.65 : 0.3} />)}
                  <path d="M64 5v118M5 64h118" opacity="0.22" />
                  {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(angle => <path key={angle} d="M64 2v4" transform={`rotate(${angle} 64 64)`} opacity="0.6" />)}
                  <circle className="yullo-beacon-echo yullo-beacon-echo-first" cx="96" cy="40" r="2" fill="currentColor" stroke="none" />
                  <circle className="yullo-beacon-echo yullo-beacon-echo-second" cx="35" cy="85" r="1.6" fill="currentColor" stroke="none" />
                  <circle cx="64" cy="64" r="5" opacity="0.45" />
                  <circle cx="64" cy="64" r="1.8" fill="currentColor" stroke="none" />
                </svg>
              </div>
            </div>
            {query.data?.enabled === false && <p role="status" className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-4 text-sm">Beacon is currently unavailable.</p>}
            {query.data?.target_changed && <p role="status" className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4 text-sm">Your saved location changed. The Beacon still uses its original target area. Reselect the location and save to update it.</p>}
            <fieldset disabled={busy}><legend className="mb-3 text-sm font-semibold">How far should it reach?</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{beaconReaches.map(item => <YulloButton key={item.value} variant={(item.value === 'nearby' ? nearby : reach === item.value) ? 'primary' : 'outline'} size="sm" aria-pressed={item.value === 'nearby' ? nearby : reach === item.value} onClick={() => { setReach(item.value); setSearch(areaName(area, item.value)); setNotice(''); }}><span>{item.label}</span></YulloButton>)}</div><p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">People find your page while browsing Nearby. No messages or notifications are sent.</p></fieldset>
            <fieldset disabled={busy} className="space-y-3">
              {nearby && <div className="pt-1">
                <div className="flex items-center justify-between text-sm font-medium"><label htmlFor={`beacon-radius-${spaceId}`}>Radius</label><output htmlFor={`beacon-radius-${spaceId}`} className="font-semibold tabular-nums text-[var(--accent-ink)]">{effectiveRadius} km</output></div>
                {legacyFive ? <YulloButton variant="outline" size="sm" className="mt-2" onClick={() => setReach('nearby')}>Change radius (10–100 km)</YulloButton> : <>
                  <input id={`beacon-radius-${spaceId}`} type="range" min={10} max={100} step={1} value={radiusKm} disabled={busy} aria-valuetext={`${radiusKm} kilometres`} className="h-11 w-full cursor-pointer accent-[var(--accent-solid)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]" onChange={event => { setRadiusKm(Number(event.target.value)); setReach('nearby'); setNotice(''); }} />
                  <div className="flex justify-between text-xs text-[var(--text-secondary)]"><span>10 km</span><span>100 km</span></div>
                </>}
              </div>}
              <h3 className="flex items-center gap-2 text-sm font-semibold"><MapPin size={16} />{reach === 'worldwide' ? 'Worldwide reach' : 'Choose your area'}</h3>
              {reach !== 'worldwide' && <LocationSearchField kind={reach === 'country' ? 'country' : 'city'} label={reach === 'country' ? 'Country' : 'City / area'} savedSuggestions={locationSuggestions} value={search} disabled={busy} onChange={value => { setSelectionRevision(current => current + 1); setSearch(value); updateArea({}); setResolvePoint(undefined); setLookup(mapsConfig.key ? 'idle' : 'failed'); }} onSelect={place => { setSelectionRevision(current => current + 1); selectPoint(place); setResolvePoint(undefined); setLookup('resolved'); }} onResolvingChange={setResolving} />}
              <GoogleLocationPicker worldwide={reach === 'worldwide'} key={mapSeed} revision={selectionRevision} compact initialPoint={point} autoResolvePoint={reach === 'worldwide' ? undefined : resolvePoint} onAutoSelect={selectPoint} radiusKm={nearby ? effectiveRadius : undefined} boundaryArea={reach === 'city' || reach === 'country' ? { kind: reach, city: area.city || undefined, region: area.region || undefined, countryCode: area.country_code || undefined } : undefined} disabled={busy} onSelect={selectPoint} onLookupStateChange={setLookup} />
              {reach !== 'worldwide' && <p role="status" className="rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--text-secondary)]">{lookup === 'loading' ? 'Finding city, state and country…' : areaLabel || (point ? 'Pin selected · Address unavailable' : 'Drop a pin or search to fill the location automatically.')}</p>}
              {reach !== 'worldwide' && (lookup === 'failed' || (lookup === 'resolved' && !targetValid)) && <details open className="rounded-lg border border-[var(--border)] p-3"><summary className="cursor-pointer text-xs font-medium">Location lookup unavailable · Enter details manually</summary><div className="mt-3"><AreaField value={area} onChange={updateArea} showCity={reach !== 'country'} coordinates={nearby} disabled={busy} onResolvingChange={setResolving} /></div>{point && mapsConfig.key && <YulloButton variant="ghost" size="sm" onClick={() => { setResolvePoint(point); setMapSeed(current => current + 1); }}>Retry address lookup</YulloButton>}</details>}

            </fieldset>
            {!targetValid && <p role="status" className="text-sm text-[var(--text-secondary)]">{nearby ? 'Choose a map point or enter both latitude and longitude.' : reach === 'city' ? 'Choose a city and its country.' : 'Choose a country for this Beacon.'}</p>}
            <section><h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><CalendarClock size={16} />Keep it visible until</h3><DateTimeField date={date} time={time} onDateChange={setDate} onTimeChange={setTime} dateLabel="Expiry date" timeLabel="Expiry time" disabled={busy} helperText={`AM/PM · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`} />{query.data?.latest_expires_at && <p className="mt-2 text-xs text-[var(--text-secondary)]">Latest expiry: {new Date(query.data.latest_expires_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>}</section>
            {expiry && !expiryValid && <p role="status" className="text-sm text-[var(--attention)]">Choose a future expiry no later than the latest expiry shown above.</p>}
            <p className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"><Globe2 size={14} className="shrink-0" />{targetLabel} · Public page details only.</p>
            {notice && <p role="status" className="flex items-start gap-2 text-sm"><Check size={18} className="shrink-0 text-[var(--accent-ink)]" />{notice}</p>}
            {error && <div role="alert" className="space-y-2 text-sm text-[var(--attention)]"><p>{error}</p>{conflict && <YulloButton variant="outline" size="sm" onClick={async () => { const result = await query.refetch(); if (result.data) load(result.data); }}>Reload settings</YulloButton>}</div>}
          </div>
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--surface)] px-6 py-4 pb-[max(16px,env(safe-area-inset-bottom))]">
            {query.data && ['active', 'unavailable'].includes(query.data.status) ? <YulloButton variant="outline" size="sm" disabled={busy || conflict} onClick={() => { setError(''); setNotice(''); mutation.mutate(true); }}><Pause size={15} />Pause</YulloButton> : <span className="text-xs capitalize text-[var(--text-secondary)]">{query.data?.status === 'inactive' ? 'Not activated' : query.data?.status}</span>}
            <div className="flex gap-2"><YulloButton variant="ghost" disabled={busy} onClick={close}>Close</YulloButton><YulloButton type="submit" isLoading={busy} disabled={busy || (reach !== 'worldwide' && (resolving || lookup === 'loading')) || conflict || !query.data?.can_activate || !expiryValid || !targetValid}><Radio size={16} />{query.data?.status === 'active' ? 'Update Beacon' : 'Activate Beacon'}</YulloButton></div>
          </footer>
        </form>}
      </motion.section>
    </Dialog.Content>
  </Dialog.Portal>;
}
