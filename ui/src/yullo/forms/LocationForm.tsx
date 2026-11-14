import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, useReducedMotion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateEntity, useUpdateEntity } from '../api/entityQueries';
import type { SpaceEntity } from '../api/entities';
import { TextField } from './core/TextField';
import { GoogleLocationPicker } from './GoogleLocationPicker';
import { googleMapLink, validPoint, type LocationSelection, type Point } from './googleLocationMaps';
import { LocationSearchField } from './LocationSearchField';
import { FormActions } from './core/FormActions';
import { useYulloLocation } from '../providers/YulloLocationProvider';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a location name.').max(200),
  address: z.string().trim().max(1000),
  city: z.string().trim().max(120),
  region: z.string().trim().max(120),
  postalCode: z.string().trim().max(32).refine(value => !value || /^[A-Za-z0-9][A-Za-z0-9 -]*$/.test(value), 'Use letters, numbers, spaces or hyphens.'),
  countryCode: z.string().trim().toUpperCase().refine(value => !value || /^[A-Z]{2}$/.test(value), 'Enter a 2-letter country code, such as IN.'),
  isRemote: z.boolean(),
  mapUrl: z.string().trim().refine(value => {
    if (!value) return true;
    try { const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password; } catch { return false; }
  }, 'Enter a valid HTTPS map link without login credentials.'),
  isPublic: z.boolean(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
}).superRefine((value, context) => {
  if (!value.isRemote && !value.address) context.addIssue({ code: 'custom', path: ['address'], message: 'Enter an address.' });
  if (!value.isRemote && (value.city || value.region) && !value.countryCode) context.addIssue({ code: 'custom', path: ['countryCode'], message: 'Add a country code for this city or region.' });
});
type Values = z.infer<typeof schema>;

export function LocationForm({ spaceId, entity, initialValues, onClose, onSaved }: {
  spaceId: string; entity?: SpaceEntity; initialValues?: Partial<Values>; onClose: () => void; onSaved: () => void;
}) {
  const form = useForm<Values>({ resolver: zodResolver(schema), mode: 'onBlur', defaultValues: {
    name: entity?.payload_json.name ?? '', address: entity?.payload_json.address ?? '',
    mapUrl: entity?.payload_json.map_url ?? '', isPublic: entity?.is_public ?? false,
    latitude: entity?.payload_json.latitude ?? null, longitude: entity?.payload_json.longitude ?? null,
    city: entity?.payload_json.city ?? '', countryCode: entity?.payload_json.country_code ?? '',
    region: entity?.payload_json.region ?? '',
    postalCode: entity?.payload_json.postal_code ?? '',
    isRemote: entity?.payload_json.is_remote ?? false,
    ...initialValues,
  } });
  const { isDirty, errors } = form.formState;
  const latitude = form.watch('latitude');
  const longitude = form.watch('longitude');
  const isRemote = form.watch('isRemote');
  const address = form.watch('address');
  const city = form.watch('city');
  const region = form.watch('region');
  const countryCode = form.watch('countryCode');
  const [mapRevision, setMapRevision] = useState(0);
  const location = useYulloLocation();
  const [autoPoint, setAutoPoint] = useState<Point>();
  const [visiblePoint, setVisiblePoint] = useState<Point | undefined>(() => {
    const lat = entity?.payload_json.latitude ?? initialValues?.latitude, lng = entity?.payload_json.longitude ?? initialValues?.longitude;
    return typeof lat === 'number' && typeof lng === 'number' && validPoint({ lat, lng }) ? { lat, lng } : undefined;
  });
  const initialized = useRef(!!initialValues);
  const explicitCurrent = useRef(false);
  const currentSelectionDirty = useRef(false);
  const [resolvingFields, setResolvingFields] = useState<Record<string, boolean>>({});
  const resolving = Object.values(resolvingFields).some(Boolean);
  const trackResolving = (field: string, busy: boolean) => setResolvingFields(previous => previous[field] === busy ? previous : { ...previous, [field]: busy });
  const autoName = useRef('');
  const latestField = useRef<string | null>(null);
  const currentLat = location.automaticAvailable ? location.area?.latitude : null;
  const currentLng = location.automaticAvailable ? location.area?.longitude : null;
  useEffect(() => {
    if (entity || isRemote || initialized.current) return;
    if (!location.locating && !location.automaticAvailable) explicitCurrent.current = false;
    // A late GPS fix must never replace a location the owner has started entering.
    if (isDirty && !explicitCurrent.current) { initialized.current = true; return; }
    if (currentLat == null || currentLng == null) return;
    const point = { lat: currentLat, lng: currentLng };
    if (!validPoint(point)) return;
    initialized.current = true;
    currentSelectionDirty.current = explicitCurrent.current;
    explicitCurrent.current = false;
    form.setValue('latitude', point.lat, { shouldDirty: currentSelectionDirty.current });
    form.setValue('longitude', point.lng, { shouldDirty: currentSelectionDirty.current });
    form.setValue('mapUrl', googleMapLink(point), { shouldDirty: currentSelectionDirty.current });
    // Old address details cannot be saved against a newly requested current-location pin.
    for (const field of ['address', 'city', 'region', 'countryCode', 'postalCode'] as const) {
      form.setValue(field, '', { shouldDirty: currentSelectionDirty.current });
    }
    setAutoPoint(point);
    setVisiblePoint(point);
  }, [entity, isRemote, isDirty, currentLat, currentLng, location.locating, location.automaticAvailable, form]);
  const clearPin = (keepVisible = false) => {
    initialized.current = true;
    explicitCurrent.current = false;
    setAutoPoint(undefined);
    if (!keepVisible) setVisiblePoint(undefined);
    setMapRevision(value => value + 1);
    const current = form.getValues();
    if (current.latitude !== null && current.longitude !== null && current.mapUrl === googleMapLink({ lat: current.latitude, lng: current.longitude })) form.setValue('mapUrl', '', { shouldDirty: true });
    form.setValue('latitude', null, { shouldDirty: true });
    form.setValue('longitude', null, { shouldDirty: true });
  };
  const fillLocation = (selection: LocationSelection, markDirty = true) => {
    setVisiblePoint({ lat: selection.lat, lng: selection.lng });
    const currentName = form.getValues('name');
    // Keep an existing owner label; only replace empty or previously auto-filled names.
    if (selection.name && (!currentName || currentName === autoName.current)) {
      const name = selection.name.slice(0, 200);
      form.setValue('name', name, { shouldDirty: markDirty, shouldValidate: true });
      autoName.current = name;
    }
    form.setValue('latitude', selection.lat, { shouldDirty: markDirty });
    form.setValue('longitude', selection.lng, { shouldDirty: markDirty });
    form.setValue('mapUrl', googleMapLink(selection), { shouldDirty: markDirty });
    form.setValue('address', selection.address || '', { shouldDirty: markDirty, shouldValidate: !!selection.address });
    form.setValue('city', selection.city || '', { shouldDirty: markDirty });
    form.setValue('region', selection.region || '', { shouldDirty: markDirty });
    form.setValue('countryCode', selection.countryCode || '', { shouldDirty: markDirty });
    form.setValue('postalCode', selection.postalCode || '', { shouldDirty: markDirty });
  };
  const editArea = (field: 'address' | 'city' | 'region', value: string) => {
    latestField.current = field;
    clearPin(true);
    form.setValue(field, value.slice(0, field === 'address' ? 1000 : 120), { shouldDirty: true });
    if (field !== 'address') form.setValue('postalCode', '', { shouldDirty: true });
  };
  const chooseArea = (field: 'city' | 'region', selection: LocationSelection) => {
    if (latestField.current !== field) return;
    if (field === 'city') form.setValue('city', selection.city || selection.name || '', { shouldDirty: true });
    else form.setValue('city', '', { shouldDirty: true });
    form.setValue('region', selection.region || (field === 'region' ? selection.name : '') || '', { shouldDirty: true });
    form.setValue('countryCode', selection.countryCode || '', { shouldDirty: true });
    form.setValue('postalCode', '', { shouldDirty: true });
  };
  const create = useCreateEntity(spaceId);
  const update = useUpdateEntity(spaceId);
  const pending = create.isPending || update.isPending;
  const busy = useRef(false);
  const identityKey = useRef(crypto.randomUUID());
  const client = useQueryClient();
  const reduced = useReducedMotion();
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const close = () => { if (!busy.current) { if (isDirty) setDiscard(true); else onClose(); } };
  const save = form.handleSubmit(async values => {
    if (busy.current || resolving) return;
    busy.current = true;
    setError('');
    try {
      const payload: SpaceEntity['payload_json'] = { ...entity?.payload_json, name: values.name, address: values.isRemote ? '' : values.address,
        map_url: values.isRemote ? null : values.mapUrl || null,
        latitude: values.isRemote ? null : values.latitude, longitude: values.isRemote ? null : values.longitude,
        city: values.isRemote ? null : values.city || null, country_code: values.isRemote ? null : values.countryCode || null,
        region: values.isRemote ? null : values.region || null,
        postal_code: values.isRemote ? null : values.postalCode || null,
        is_remote: values.isRemote };
      // Keep legacy physical-location requests unchanged; omitted optional fields reset to defaults.
      if (!payload.city) delete payload.city;
      if (!payload.region) delete payload.region;
      if (!payload.postal_code) delete payload.postal_code;
      if (!payload.country_code) delete payload.country_code;
      if (!payload.is_remote) delete payload.is_remote;
      if (entity) await update.mutateAsync({ entityId: entity.id, patch: { expected_revision: entity.revision, payload_json: payload, is_public: values.isPublic } });
      else await create.mutateAsync({ identity_key: identityKey.current, entity_type: 'location', payload_json: payload, is_public: values.isPublic });
      void client.invalidateQueries({ queryKey: ['yullo', 'appearance-live-preview', spaceId] });
      void client.invalidateQueries({ queryKey: ['yullo', 'appearance', spaceId] });
      void client.invalidateQueries({ queryKey: ['yullo-home'] });
      void client.invalidateQueries({ queryKey: ['yullo-nearby'] });
      onSaved();
    } catch (failure) {
      const conflict = (failure as { response?: { status?: number } })?.response?.status === 409;
      if (conflict) void client.invalidateQueries({ queryKey: ['yullo-entities', spaceId] });
      setError(conflict ? 'This location changed elsewhere. Close and reopen it before saving.' : 'Could not save. Your details are still here; try again.');
    } finally { busy.current = false; }
  });
  return <Dialog.Root open onOpenChange={open => { if (!open) close(); }}>
    <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
    <Dialog.Content asChild onOpenAutoFocus={event => {
      event.preventDefault();
      const search = document.getElementById('location-address') as HTMLInputElement | null;
      if (!isRemote && search && !search.disabled) search.focus({ preventScroll: true });
      else form.setFocus('name');
    }}>
      <motion.section initial={reduced ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : 0.2 }} className="fixed inset-y-0 right-0 z-[61] flex h-[100dvh] w-full max-w-[780px] flex-col bg-[var(--canvas)] text-[var(--text-primary)] font-[Instrument_Sans] shadow-xl min-[720px]:rounded-l-2xl">
        <header className="flex justify-between gap-4 border-b border-[var(--border)] p-5 sm:p-8">
          <div><Dialog.Title className="font-[Satoshi] text-[28px] font-semibold">{entity ? 'Edit location' : 'Add location'}</Dialog.Title><Dialog.Description className="mt-2 text-[var(--text-secondary)]">{isRemote ? 'Add the details for your online location.' : 'Start with an address. Choose a suggestion to fill in the details.'}</Dialog.Description></div>
          <button type="button" aria-label="Close location editor" onClick={close} disabled={pending} className="min-h-12 min-w-12">✕</button>
        </header>
        <form id="location-form" onSubmit={save} noValidate className="flex-1 overflow-y-auto p-5 sm:p-8">
          <fieldset disabled={pending}>
            {!isRemote && <>
              {!entity && location.locating && !autoPoint && <p role="status" className="mb-3 text-sm text-[var(--text-secondary)]">Finding your current location…</p>}
              {!entity && !location.locating && !location.automaticAvailable && <button type="button" onClick={() => { initialized.current = false; explicitCurrent.current = true; location.requestLocation(); }} disabled={pending} className="mb-3 min-h-11 text-sm text-[var(--accent-ink)]">Use my current location</button>}
              {autoPoint && <p role="status" className="mb-3 text-sm text-[var(--text-secondary)]">Your current location is selected. You can adjust it below.</p>}
              <LocationSearchField id="location-address" label="Address" value={address} registration={form.register('address')} onChange={value => editArea('address', value)}
                onSelect={selection => { if (latestField.current === 'address') { setMapRevision(value => value + 1); fillLocation(selection); } }}
                onResolvingChange={busy => trackResolving('address', busy)}
                disabled={pending} error={errors.address?.message} />
              <GoogleLocationPicker initialPoint={latitude !== null && longitude !== null ? { lat: latitude, lng: longitude } : visiblePoint}
                pinNeedsUpdate={latitude === null && !!visiblePoint}
                revision={mapRevision} autoResolvePoint={autoPoint} onAutoSelect={selection => fillLocation(selection, currentSelectionDirty.current)} disabled={pending} onSelect={selection => { setAutoPoint(undefined); fillLocation(selection); }} />
            </>}
            <TextField label="Location name" aria-label="Location name" registration={form.register('name')} error={errors.name?.message} maxLength={200} helperText="Use a familiar label, such as Home, Office or Main branch." />
            <label className="flex min-h-12 items-center gap-3"><input type="checkbox" {...form.register('isRemote')} className="h-5 w-5 accent-[var(--accent,var(--accent-solid))]" />Remote / online only</label>
            {!isRemote && <>
            {latitude !== null && longitude !== null && <p className="mb-3 text-sm">Location pin selected <button type="button" onClick={() => clearPin()} className="min-h-12 px-3 text-[var(--accent-ink)]">Remove pin</button></p>}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <LocationSearchField label="City" kind="city" value={city} registration={form.register('city')} onChange={value => editArea('city', value)} onSelect={selection => chooseArea('city', selection)} onResolvingChange={busy => trackResolving('city', busy)} countryCode={countryCode} disabled={pending} error={errors.city?.message} />
              <LocationSearchField label="State / region" kind="region" value={region} registration={form.register('region')} onChange={value => editArea('region', value)} onSelect={selection => chooseArea('region', selection)} onResolvingChange={busy => trackResolving('region', busy)} countryCode={countryCode} disabled={pending} error={errors.region?.message} />
              <TextField label="PIN / postal code" aria-label="PIN / postal code" autoComplete="postal-code" registration={form.register('postalCode', { onChange: () => { latestField.current = null; clearPin(true); } })} error={errors.postalCode?.message} maxLength={32} />
              <TextField label="Country code" aria-label="Country code" autoComplete="country" registration={form.register('countryCode', { onChange: () => { latestField.current = null; clearPin(true); } })} error={errors.countryCode?.message} maxLength={2} helperText="2 letters, such as IN or US." />
            </div>
            <p className="text-sm text-[var(--text-secondary)]">Nearby uses your map pin first, then your city, region or country when available.</p>
            </>}
            <label className="flex min-h-12 items-center gap-3"><input type="checkbox" role="switch" {...form.register('isPublic')} className="h-5 w-5 accent-[var(--accent-solid)]" />Show publicly</label>
            <p className="text-sm text-[var(--text-secondary)]">Public locations on a live Space can appear in Nearby. Off keeps this location private. Appearance controls the public Location section.</p>
          </fieldset>
          {error && <p role="alert" className="mt-5 text-[var(--critical)]">{error}</p>}
          {discard && <div role="alert" className="mt-5 border-t border-[var(--border)] pt-4"><p>Discard unsaved location changes?</p><button type="button" onClick={() => setDiscard(false)} className="mr-5 min-h-12 text-[var(--accent-ink)]">Keep editing</button><button type="button" onClick={onClose} className="min-h-12">Discard</button></div>}
        </form>
        <FormActions form="location-form" submitLabel="Save location" onCancel={close} isSubmitting={pending} isDisabled={resolving} className="shrink-0 px-5 sm:px-8" />
      </motion.section>
    </Dialog.Content>
  </Dialog.Root>;
}
