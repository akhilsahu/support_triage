import React, { useRef, useState } from 'react';
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
import { googleMapLink } from './googleLocationMaps';
import { FormActions } from './core/FormActions';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a place name.').max(200),
  address: z.string().trim().min(1, 'Enter an address.').max(1000),
  mapUrl: z.string().trim().refine(value => {
    if (!value) return true;
    try { const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password; } catch { return false; }
  }, 'Enter a valid HTTPS map link without login credentials.'),
  isPublic: z.boolean(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
});
type Values = z.infer<typeof schema>;

export function LocationForm({ spaceId, entity, onClose, onSaved }: {
  spaceId: string; entity?: SpaceEntity; onClose: () => void; onSaved: () => void;
}) {
  const form = useForm<Values>({ resolver: zodResolver(schema), mode: 'onBlur', defaultValues: {
    name: entity?.payload_json.name ?? '', address: entity?.payload_json.address ?? '',
    mapUrl: entity?.payload_json.map_url ?? '', isPublic: entity?.is_public ?? false,
    latitude: entity?.payload_json.latitude ?? null, longitude: entity?.payload_json.longitude ?? null,
  } });
  const { isDirty, errors } = form.formState;
  const latitude = form.watch('latitude');
  const longitude = form.watch('longitude');
  const clearPin = () => {
    const current = form.getValues();
    if (current.latitude !== null && current.longitude !== null && current.mapUrl === googleMapLink({ lat: current.latitude, lng: current.longitude })) form.setValue('mapUrl', '', { shouldDirty: true });
    form.setValue('latitude', null, { shouldDirty: true });
    form.setValue('longitude', null, { shouldDirty: true });
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
    if (busy.current) return;
    busy.current = true;
    setError('');
    try {
      const payload = { ...entity?.payload_json, name: values.name, address: values.address, map_url: values.mapUrl || null, latitude: values.latitude, longitude: values.longitude };
      if (entity) await update.mutateAsync({ entityId: entity.id, patch: { expected_revision: entity.revision, payload_json: payload, is_public: values.isPublic } });
      else await create.mutateAsync({ identity_key: identityKey.current, entity_type: 'location', payload_json: payload, is_public: values.isPublic });
      void client.invalidateQueries({ queryKey: ['yullo', 'appearance-live-preview', spaceId] });
      void client.invalidateQueries({ queryKey: ['yullo', 'appearance', spaceId] });
      void client.invalidateQueries({ queryKey: ['yullo-home'] });
      onSaved();
    } catch (failure) {
      const conflict = (failure as { response?: { status?: number } })?.response?.status === 409;
      if (conflict) void client.invalidateQueries({ queryKey: ['yullo-entities', spaceId] });
      setError(conflict ? 'This location changed elsewhere. Close and reopen it before saving.' : 'Could not save. Your details are still here; try again.');
    } finally { busy.current = false; }
  });
  return <Dialog.Root open onOpenChange={open => { if (!open) close(); }}>
    <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
    <Dialog.Content asChild onOpenAutoFocus={event => { event.preventDefault(); form.setFocus('name'); }}>
      <motion.section initial={reduced ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : 0.2 }} className="fixed inset-y-0 right-0 z-[61] flex h-[100dvh] w-full max-w-[780px] flex-col bg-[var(--canvas)] text-[var(--text-primary)] font-[Instrument_Sans] shadow-xl min-[720px]:rounded-l-2xl">
        <header className="flex justify-between gap-4 border-b border-[var(--border)] p-5 sm:p-8">
          <div><Dialog.Title className="font-[Satoshi] text-[28px] font-semibold">{entity ? 'Edit location' : 'Add location'}</Dialog.Title><Dialog.Description className="mt-2 text-[var(--text-secondary)]">Save the place details your Space uses.</Dialog.Description></div>
          <button type="button" aria-label="Close location editor" onClick={close} disabled={pending} className="min-h-12 min-w-12">✕</button>
        </header>
        <form id="location-form" onSubmit={save} noValidate className="flex-1 overflow-y-auto p-5 sm:p-8">
          <fieldset disabled={pending}>
            <TextField label="Place name" aria-label="Place name" registration={form.register('name')} error={errors.name?.message} maxLength={200} />
            <GoogleLocationPicker initialPoint={latitude !== null && longitude !== null ? { lat: latitude, lng: longitude } : undefined} address={form.getValues('address')} disabled={pending} onSelect={selection => {
              form.setValue('latitude', selection.lat, { shouldDirty: true });
              form.setValue('longitude', selection.lng, { shouldDirty: true });
              form.setValue('mapUrl', googleMapLink(selection), { shouldDirty: true, shouldValidate: true });
              form.setValue('address', selection.address || '', { shouldDirty: true, shouldValidate: true });
            }} />
            {latitude !== null && longitude !== null && <p className="mb-3 text-sm">Selected pin: {latitude.toFixed(6)}, {longitude.toFixed(6)} <button type="button" onClick={clearPin} className="min-h-12 px-3 text-[var(--accent-ink)]">Remove pin</button></p>}
            <label htmlFor="location-address" className="mb-2 block text-sm font-medium">Address</label>
            <textarea id="location-address" {...form.register('address', { onChange: clearPin })} maxLength={1000} rows={4} aria-invalid={!!errors.address} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-4 text-base text-[var(--text-primary)] focus:outline-[var(--focus)]" />
            {errors.address && <p role="alert" className="text-[var(--critical)]">{errors.address.message}</p>}
            <div className="mt-6"><TextField label="Map link (optional)" aria-label="Map link (optional)" type="url" registration={form.register('mapUrl', { onChange: () => { form.setValue('latitude', null, { shouldDirty: true }); form.setValue('longitude', null, { shouldDirty: true }); } })} error={errors.mapUrl?.message} helperText="Paste a map link visitors can open for directions." /></div>
            <label className="flex min-h-12 items-center gap-3"><input type="checkbox" role="switch" {...form.register('isPublic')} className="h-5 w-5 accent-[var(--accent-solid)]" />Show publicly</label>
            <p className="text-sm text-[var(--text-secondary)]">Off keeps this location private. Appearance controls whether the public Location section is shown.</p>
          </fieldset>
          {error && <p role="alert" className="mt-5 text-[var(--critical)]">{error}</p>}
          {discard && <div role="alert" className="mt-5 border-t border-[var(--border)] pt-4"><p>Discard unsaved location changes?</p><button type="button" onClick={() => setDiscard(false)} className="mr-5 min-h-12 text-[var(--accent-ink)]">Keep editing</button><button type="button" onClick={onClose} className="min-h-12">Discard</button></div>}
        </form>
        <FormActions form="location-form" submitLabel="Save location" onCancel={close} isSubmitting={pending} className="shrink-0 px-5 sm:px-8" />
      </motion.section>
    </Dialog.Content>
  </Dialog.Root>;
}
