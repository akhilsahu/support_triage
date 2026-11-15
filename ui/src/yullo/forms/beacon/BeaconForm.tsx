import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, useReducedMotion } from 'motion/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { CalendarClock, Check, Globe2, MapPin, Pause, Radio, X } from 'lucide-react';
import { beaconKey, beaconReaches, saveBeacon, useBeacon, type BeaconReach, type BeaconState } from '../../api/beacon';
import type { NearbyArea } from '../../api/nearby';
import type { SpaceEntity } from '../../api/entities';
import { useYulloAppStore } from '../../store/useYulloAppStore';
import { YulloButton } from '../../components/core/YulloButton';
import { IconTooltip } from '../core/IconTooltip';
import { DateTimeField } from '../core/DateTimeField';
import { AreaField, areaFromSelection } from '../core/AreaField';
import { GoogleLocationPicker } from '../GoogleLocationPicker';

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
  const [reach, setReach] = useState<BeaconReach>('nearby_10');
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
  const load = (state: BeaconState) => {
    setReach(state.config?.reach || 'nearby_10');
    setArea(state.config?.target_area || {});
    setLocationId(state.config?.origin_location_entity_id || '');
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
        reach, target_area: reach === 'worldwide' ? {} : area,
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
  const nearby = reach.startsWith('nearby_');
  const busy = mutation.isPending;
  const reachLabel = beaconReaches.find(item => item.value === reach)!.label;
  const targetLabel = reach === 'worldwide' ? 'Worldwide' : nearby ? `Within ${reachLabel} of your chosen point` : [reach === 'city' ? area.city : null, area.country_code].filter(Boolean).join(', ') || 'Choose an area';
  const updateArea = (value: NearbyArea) => { setArea(value); setLocationId(''); setNotice(''); };
  const expiry = date && time ? new Date(`${date}T${time}`) : null;
  const expiryValid = expiry && !Number.isNaN(expiry.getTime()) && expiry.getTime() > Date.now() && (!query.data?.latest_expires_at || expiry.getTime() <= new Date(query.data.latest_expires_at).getTime());
  const targetValid = reach === 'worldwide' || (nearby ? area.latitude != null && area.longitude != null : !!area.country_code && (reach !== 'city' || !!area.city));
  return <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/40" onPointerDown={event => { if (busy) event.preventDefault(); }} />
    <Dialog.Content asChild onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}>
      <motion.section initial={reduced ? false : { x: 16, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: reduced ? 0 : 0.2, ease: 'easeOut' }} className="yullo-app fixed inset-y-0 right-0 z-[101] flex h-[100dvh] w-full max-w-[640px] flex-col border-l border-[var(--border)] bg-[var(--canvas)] text-[var(--text-primary)] shadow-2xl outline-none sm:rounded-l-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
          <div><Dialog.Title className="flex items-center gap-2 text-xl font-semibold"><Radio size={21} className="text-[var(--accent-ink)]" />Beacon</Dialog.Title><Dialog.Description className="mt-1 text-sm text-[var(--text-secondary)]">Put this page on the map. Choose who can find it.</Dialog.Description></div>
          <IconTooltip label="Close Beacon"><YulloButton variant="ghost" size="icon" disabled={busy} onClick={close} aria-label="Close Beacon"><X size={19} /></YulloButton></IconTooltip>
        </header>
        {query.isPending ? <p role="status" className="p-6">Loading Beacon…</p> : query.isError ? <div role="alert" className="space-y-3 p-6"><p>Beacon is unavailable right now.</p><YulloButton variant="outline" onClick={() => void query.refetch()}>Try again</YulloButton></div> : <form className="flex min-h-0 flex-1 flex-col" onSubmit={event => { event.preventDefault(); setError(''); setNotice(''); if (!busy && !conflict && expiryValid && targetValid) mutation.mutate(false); }}>
          <div className="min-h-0 flex-1 space-y-7 overflow-y-auto p-6">
            <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(125deg,var(--accent-soft),var(--surface))] p-5">
              <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full border border-[var(--accent-border)]"><div className="absolute inset-7 rounded-full border border-[var(--accent-border)]" /><div className="absolute inset-14 rounded-full bg-[var(--accent-soft)]" /></div>
              <div className="relative flex items-center gap-4">{cover ? <img src={cover} alt="" className="h-20 w-24 shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] object-contain" /> : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-[var(--accent-border)] bg-[var(--surface)] text-[var(--accent-ink)]"><Radio size={28} /></span>}<div className="min-w-0"><p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--accent-ink)]">{query.data?.status === 'active' ? 'Active in Nearby' : 'Your Beacon'}</p><h3 className="break-words text-lg font-semibold">{title}</h3><p className="mt-1 text-sm text-[var(--text-secondary)]">{targetLabel}</p></div></div>
            </div>
            {!query.data?.can_activate && <p role="status" className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-4 text-sm">{query.data?.enabled === false ? 'Beacon is currently unavailable.' : 'This page and its parent pages must be live, and its event must not have ended, before you can activate a Beacon.'}</p>}
            {query.data?.target_changed && <p role="status" className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4 text-sm">Your saved location changed. The Beacon still uses its original target area. Reselect the location and save to update it.</p>}
            <fieldset disabled={busy}><legend className="mb-3 text-sm font-semibold">How far should it reach?</legend><div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{beaconReaches.map(item => <YulloButton key={item.value} variant={reach === item.value ? 'primary' : 'outline'} size="sm" aria-pressed={reach === item.value} onClick={() => { setReach(item.value); setNotice(''); }}><span>{item.label}</span></YulloButton>)}</div><p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">People find your page while browsing Nearby. No messages or notifications are sent.</p></fieldset>
            {reach !== 'worldwide' && <fieldset disabled={busy} className="space-y-4"><legend className="mb-3 flex items-center gap-2 text-sm font-semibold"><MapPin size={16} />Target area</legend>
              {!!savedLocations.length && <label className="block text-sm">Use a location from this page<select value={locationId} disabled={busy} className="mt-2 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 focus:outline-[var(--accent)]" onChange={event => {
                const location = savedLocations.find(item => item.id === event.target.value);
                setLocationId(event.target.value);
                if (location) { const payload = location.payload_json; setArea({ latitude: payload.latitude, longitude: payload.longitude, city: payload.city, region: payload.region, country_code: payload.country_code }); }
              }}><option value="">Choose a different area</option>{savedLocations.map(item => <option key={item.id} value={item.id}>{item.payload_json.name || item.payload_json.address}</option>)}</select></label>}
              {nearby && <GoogleLocationPicker key={reach} initialPoint={area.latitude != null && area.longitude != null ? { lat: area.latitude, lng: area.longitude } : undefined} disabled={busy} onSelect={place => updateArea(areaFromSelection(place))} />}
              <AreaField value={area} onChange={updateArea} showCity={reach !== 'country'} coordinates={nearby} disabled={busy} onResolvingChange={setResolving} />
              <p className="text-xs leading-5 text-[var(--text-secondary)]">The target point is used for matching. Private addresses are not added to the public card.</p>
            </fieldset>}
            {!targetValid && <p role="status" className="text-sm text-[var(--text-secondary)]">{nearby ? 'Choose a map point or enter both latitude and longitude.' : reach === 'city' ? 'Choose a city and its country.' : 'Choose a country for this Beacon.'}</p>}
            <section><h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><CalendarClock size={16} />Keep it visible until</h3><DateTimeField date={date} time={time} onDateChange={setDate} onTimeChange={setTime} dateLabel="Expiry date" timeLabel="Expiry time" disabled={busy} helperText={`AM/PM · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`} />{query.data?.latest_expires_at && <p className="mt-2 text-xs text-[var(--text-secondary)]">Latest expiry: {new Date(query.data.latest_expires_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>}</section>
            {expiry && !expiryValid && <p role="status" className="text-sm text-[var(--attention)]">Choose a future expiry no later than the latest expiry shown above.</p>}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm"><p className="flex items-center gap-2 font-medium"><Globe2 size={16} className="text-[var(--accent-ink)]" />{targetLabel}</p><p className="mt-2 text-[var(--text-secondary)]">{expiry && !Number.isNaN(expiry.getTime()) ? `Visible until ${expiry.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.` : 'Choose when this Beacon should end.'} Only public page details appear in Nearby.</p></div>
            {notice && <p role="status" className="flex items-start gap-2 text-sm"><Check size={18} className="shrink-0 text-[var(--accent-ink)]" />{notice}</p>}
            {error && <div role="alert" className="space-y-2 text-sm text-[var(--attention)]"><p>{error}</p>{conflict && <YulloButton variant="outline" size="sm" onClick={async () => { const result = await query.refetch(); if (result.data) load(result.data); }}>Reload settings</YulloButton>}</div>}
          </div>
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--surface)] px-6 py-4 pb-[max(16px,env(safe-area-inset-bottom))]">
            {query.data && ['active', 'unavailable'].includes(query.data.status) ? <YulloButton variant="outline" size="sm" disabled={busy || conflict} onClick={() => { setError(''); setNotice(''); mutation.mutate(true); }}><Pause size={15} />Pause</YulloButton> : <span className="text-xs capitalize text-[var(--text-secondary)]">{query.data?.status === 'inactive' ? 'Not activated' : query.data?.status}</span>}
            <div className="flex gap-2"><YulloButton variant="ghost" disabled={busy} onClick={close}>Close</YulloButton><YulloButton type="submit" isLoading={busy} disabled={busy || resolving || conflict || !query.data?.can_activate || !expiryValid || !targetValid}><Radio size={16} />{query.data?.status === 'active' ? 'Update Beacon' : 'Activate Beacon'}</YulloButton></div>
          </footer>
        </form>}
      </motion.section>
    </Dialog.Content>
  </Dialog.Portal>;
}
