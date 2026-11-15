import { format } from 'date-fns';
import { YulloButton } from '../../components/core/YulloButton';
import { CategoryCombobox } from '../core/CategoryCombobox';
import { subspaceTypeSuggestions, spaceTypeFromLabel } from '../../api/spaces';
import { IconTooltip } from '../core/IconTooltip';
import { ImageField } from '../core/ImageField';
import { DetailFields, emptySubspaceFields } from './DetailFields';
import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import * as Tooltip from '@radix-ui/react-tooltip';
import { motion, useReducedMotion } from 'motion/react';
import { DateTimeField } from '../core/DateTimeField';
import { LocationSearchField } from '../LocationSearchField';
import { GoogleLocationPicker } from '../GoogleLocationPicker';
import { googleMapLink, type LocationSelection, type Point } from '../googleLocationMaps';
import { ArrowUpRight, Bot, Building2, CalendarDays, FileText, MoreHorizontal, Plus, RefreshCw, RotateCcw, Wrench, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { formsApi } from '../../api/forms';
import { SUBSPACE_DESCRIPTION_LIMIT, hierarchyKey, patchHierarchy, spaceItemLabel, spaceTypeLabel, useSpaceHierarchy, type HierarchySpace, type SpaceType, type QuickSpaceContext } from '../../api/spaces';
import { yulloApiClient } from '../../api/client';
import { useYulloAppStore } from '../../store/useYulloAppStore';

const field = 'min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]';
const action = 'min-h-11 rounded-lg bg-[var(--accent-solid)] px-4 text-[var(--accent-on-solid)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]';
const quiet = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-[var(--accent-ink)] hover:bg-[var(--surface-soft)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]';
const dialogField = 'min-h-11 sm:min-h-10 min-w-0 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-base sm:text-sm leading-5 text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-50';
const labelStyle = 'block min-w-0 text-[13px] font-medium text-[var(--text-primary)]';
const toolStyle = 'inline-flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)] disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]';
const quickChoices = [
  { type: 'event', label: 'Event', icon: CalendarDays },
  { type: 'posting', label: 'Posting', icon: FileText },
  { type: 'service', label: 'Service', icon: Wrench },
  { type: 'other', label: 'Other', icon: MoreHorizontal },
] as const;
const errorMessage = (error: unknown) => isAxiosError(error) && error.response?.status === 409
  ? 'Details changed. Refresh and try again.' : 'Could not save. Please try again.';

export function AddSubspace({ spaceId, onLink, onManage, disabled = false }: { spaceId: string; onLink?: () => void; onManage?: () => void; disabled?: boolean }) {
  const reducedMotion = useReducedMotion();
  const [type, setType] = useState<SpaceType | null>(null);
  const [typeLabel, setTypeLabel] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [aiHintOpen, setAiHintOpen] = useState(false);
  const aiHintShown = useRef(false);
  useEffect(() => {
    if (!aiHintOpen) return;
    const timer = window.setTimeout(() => setAiHintOpen(false), 3000);
    return () => window.clearTimeout(timer);
  }, [aiHintOpen]);
  const [cover, setCover] = useState('');
  const [detailFields, setDetailFields] = useState(emptySubspaceFields);
  const [place, setPlace] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const scheduleTouched = useRef(false);
  const defaultSchedule = () => {
    const start = new Date(Math.ceil(Date.now() / 60000) * 60000 + 10 * 60000);
    setDate(format(start, 'yyyy-MM-dd'));
    setTime(format(start, 'HH:mm'));
  };
  const [locationMode, setLocationMode] = useState<'online' | 'physical' | null>(null);
  const [meetingLink, setMeetingLink] = useState('');
  const [pin, setPin] = useState<Point>();
  const [locationCountry, setLocationCountry] = useState<string>();
  const [resolvingPlace, setResolvingPlace] = useState(false);
  const [url, setUrl] = useState('');
  const [copiedRevision, setCopiedRevision] = useState<number>();
  const [suggestion, setSuggestion] = useState<{ text: string; revision?: number } | null>(null);
  const [previous, setPrevious] = useState<{ text: string; revision?: number } | null>(null);
  const [failure, setFailure] = useState('');
  const [creationId, setCreationId] = useState(() => crypto.randomUUID());
  const [menuOpen, setMenuOpen] = useState(false);
  const ownerId = useYulloAppStore(state => state.user?.id);
  const typeHierarchy = useSpaceHierarchy();
  const typeSuggestions = Array.from(new Set<string>([...subspaceTypeSuggestions, ...(typeHierarchy.data || []).filter(node => node.parent_space_id && node.type_label).map(node => node.type_label!)]));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const parent = useQuery({ queryKey: ['subspace-parent', ownerId, spaceId], enabled: !!type && !!ownerId,
    queryFn: () => formsApi.getIdentity(spaceId, ownerId), gcTime: 0 });
  const sameAccount = () => useYulloAppStore.getState().user?.id === ownerId;
  const context = (): QuickSpaceContext => ({
    subspace_fields: detailFields,
    place: type === 'event' ? (locationMode === 'physical' ? place : '') : type === 'job' ? place : '',
    location_mode: type === 'event' ? locationMode || undefined : undefined,
    meeting_url: type === 'event' && locationMode === 'online' ? meetingLink.trim() || undefined : undefined,
    ...(type === 'event' && locationMode === 'physical' && pin ? { latitude: pin.lat, longitude: pin.lng, map_url: googleMapLink(pin) } : {}),
    destination_url: url.trim() || undefined,
    starts_at: type === 'event' && date && time ? new Date(`${date}T${time}`).toISOString() : undefined, copied_company_revision: copiedRevision });
  const generate = useMutation({ mutationFn: async () => (await yulloApiClient.post<{ description: string }>(
    `/spaces/${spaceId}/subspace-description`, { name, space_type: type, type_label: typeLabel, description, context: context(), time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    { headers: { 'X-Yullo-Chat-Account': ownerId } })).data,
    onSuccess: result => { if (sameAccount()) { setSuggestion({ text: result.description }); setFailure(''); } },
    onError: () => { if (sameAccount()) setFailure('Could not generate a description. You can write one or try again.'); } });
  const save = useMutation({ mutationFn: () => {
    const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'space';
    return formsApi.createSpace({ display_name: name.trim(), slug: `${base}-${creationId.slice(0, 8)}`,
      purpose: parent.data!.purpose, parent_space_id: spaceId, space_type: type!, type_label: typeLabel, description, logo_url: cover,
      category: spaceTypeLabel(type!), quick_context: context() }, ownerId);
  }, onSuccess: async result => {
    if (!sameAccount()) return;
    setType(null);
    await Promise.all([queryClient.invalidateQueries({ queryKey: hierarchyKey(ownerId) }), queryClient.invalidateQueries({ queryKey: ['yullo-home'] })]);
    if (sameAccount() && result.space_id) navigate(`/yullo/spaces/${result.space_id}`);
  }, onError: error => { if (sameAccount()) { setFailure(errorMessage(error)); if (isAxiosError(error) && error.response?.status === 409) void parent.refetch(); } } });
  const open = (value: SpaceType) => {
    setDetailFields(emptySubspaceFields());
    scheduleTouched.current = false;
    setMenuOpen(false);
    setType(value); setTypeLabel(value === 'other' ? '' : spaceTypeLabel(value)); setAiHintOpen(false); aiHintShown.current = false; setCover(''); setName(''); setDescription(''); setPlace(''); setDate(''); setTime(''); setUrl('');
    if (value === 'event') defaultSchedule();
    setLocationMode(null); setMeetingLink(''); setPin(undefined); setLocationCountry(undefined); setResolvingPlace(false);
    setCopiedRevision(undefined); setSuggestion(null); setPrevious(null); setFailure(''); setCreationId(crypto.randomUUID());
  };
  const busy = save.isPending || generate.isPending || resolvingPlace;
  const scheduleIncomplete = type === 'event' && Boolean(date) !== Boolean(time);
  // Only resolve explicit draft placeholders; never rewrite owner-authored sentences.
  const fillOverview = (venue?: string, schedule?: string) => {
    const fill = (text: string) => {
      const next = text
        .replace(/\[(?:Venue\/address|Venue or online link|Online link)\]/gi, match => venue || match)
        .replace(/\[Date and time\]/gi, match => schedule || match);
      return next.length <= SUBSPACE_DESCRIPTION_LIMIT ? next : text;
    };
    setDescription(fill);
    setSuggestion(current => current ? { ...current, text: fill(current.text) } : null);
  };
  const updateSchedule = (nextDate: string, nextTime: string) => {
    scheduleTouched.current = true;
    setDate(nextDate); setTime(nextTime);
    if (nextDate && nextTime) {
      const value = new Date(`${nextDate}T${nextTime}`);
      if (!Number.isNaN(value.getTime())) fillOverview(undefined, new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium', timeStyle: 'short',
      }).format(value));
    }
  };
  const selectVenue = (selection: LocationSelection) => {
    setLocationCountry(selection.countryCode);
    setPlace((selection.address || selection.name || '').slice(0, 300));
    setPin({ lat: selection.lat, lng: selection.lng });
    fillOverview(selection.address || selection.name);
  };
  const itemLabel = typeLabel.trim().toLowerCase() || 'item';
  const titleLabel = typeLabel.trim() ? `${typeLabel.trim()} title` : 'Title';
  const overviewLabel = typeLabel.trim() ? `${typeLabel.trim()} overview` : 'Overview';
  return <>
    <Tooltip.Provider delayDuration={200}>
      <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Tooltip.Root><Tooltip.Trigger asChild><Popover.Trigger asChild><button type="button" disabled={disabled} aria-label="Add to this Space" className={`${quiet} yullo-space-add h-11 w-11 !rounded-xl !px-0`}><Plus size={22} strokeWidth={2.75} aria-hidden="true" /></button></Popover.Trigger></Tooltip.Trigger>
          <Tooltip.Portal><Tooltip.Content side="bottom" sideOffset={6} className="yullo-app z-[170] rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] shadow-sm">Add to this Space</Tooltip.Content></Tooltip.Portal>
        </Tooltip.Root>
        <Popover.Portal><Popover.Content align="end" sideOffset={8} onCloseAutoFocus={event => { if (type) event.preventDefault(); }} className="yullo-app z-[140] w-[280px] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 text-[var(--text-primary)] shadow-lg">
          <div className="grid grid-cols-4 gap-1">{quickChoices.map(({ type: choice, label, icon: Icon }) => <button key={choice} type="button" className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--accent-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]" onClick={() => open(choice)}><span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ color: `var(--space-type-${choice})`, backgroundColor: `color-mix(in srgb, var(--space-type-${choice}) 12%, var(--surface))` }}><Icon size={20} strokeWidth={2.25} aria-hidden="true" /></span><span>{label}</span></button>)}</div>
          <details className="mt-1 border-t border-[var(--border)] pt-1"><summary className={`${quiet} cursor-pointer text-xs`}>More options</summary>
            {(['job', 'project'] as const).map(choice => <button key={choice} type="button" className={`${quiet} w-full !justify-start text-sm`} onClick={() => open(choice)}>{spaceTypeLabel(choice)}</button>)}
            {onLink && <button type="button" className={`${quiet} w-full !justify-start text-sm`} onClick={() => { setMenuOpen(false); onLink(); }}>Link existing Space</button>}
            {onManage && <button type="button" className={`${quiet} w-full !justify-start text-sm`} onClick={() => { setMenuOpen(false); onManage(); }}>Manage linked Spaces</button>}
          </details>
        </Popover.Content></Popover.Portal>
      </Popover.Root>
    </Tooltip.Provider>
    <Dialog.Root open={!!type} onOpenChange={value => { if (!value && !busy) setType(null); }}>
      <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[100] bg-black/40" />
        <Dialog.Content asChild>
        <motion.section initial={!reducedMotion ? { x: 16, opacity: 0 } : false} animate={{ x: 0, opacity: 1 }} transition={{ duration: reducedMotion ? 0 : 0.2, ease: 'easeOut' }} className="yullo-app fixed inset-y-0 right-0 z-[101] flex h-[100dvh] w-full max-w-[min(640px,100vw)] flex-col border-l border-[var(--border)] bg-[var(--canvas)] text-[var(--text-primary)] shadow-2xl outline-none min-[720px]:rounded-l-2xl">
          <div className="mx-auto flex w-full max-w-[680px] shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <Dialog.Title className="text-[18px] font-semibold leading-6 tracking-tight">Create {itemLabel}</Dialog.Title>
              <Dialog.Description className="mt-1 truncate text-[13px] leading-5 text-[var(--text-secondary)]" title={parent.data?.display_name}>In {parent.data?.display_name || 'this Space'}</Dialog.Description>
            </div>
            <IconTooltip label="Close creation form" disabledReason={busy ? 'Wait for the current action to finish.' : undefined}><Dialog.Close disabled={busy} className={toolStyle} aria-label="Close"><X size={16} aria-hidden="true" /></Dialog.Close></IconTooltip>
          </div>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={event => { event.preventDefault(); if (!busy && !scheduleIncomplete && typeLabel.trim() && name.trim() && parent.data) save.mutate(); }}>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <fieldset disabled={save.isPending || generate.isPending} className="mx-auto w-full max-w-[680px] space-y-4 px-5 py-4 sm:px-6 sm:py-5">
              <div className="grid gap-4 min-[480px]:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
              <div className="min-w-0"><label htmlFor={`subspace-type-${spaceId}`} className={`${labelStyle} mb-2`}>Type</label><CategoryCombobox id={`subspace-type-${spaceId}`} value={typeLabel} onChange={value => { const label = value === 'Other' ? '' : value; const nextType = spaceTypeFromLabel(label); setTypeLabel(label); setType(nextType); if (nextType === 'event' && !date && !time && !scheduleTouched.current) defaultSchedule(); }} suggestions={typeSuggestions} autoFocus={type === 'other' && !typeLabel} itemLabel="type" placeholder="Event, Post, Announcement—or your own type" maxLength={60} disabled={busy} /></div>
              <label className={`${labelStyle} min-w-0`}>{titleLabel}<input required autoFocus={type !== 'other'} maxLength={200} className={`${dialogField} mt-2`} placeholder={type === 'event' ? 'e.g. Annual partner summit' : undefined} value={name} onChange={event => setName(event.target.value)} /></label>
              </div>
              <ImageField value={cover} onChange={setCover} label="Cover image" disabled={busy} compact />
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
                  <label htmlFor={`overview-${spaceId}`} className={labelStyle}>{overviewLabel}</label>
                  <div role="group" aria-label="Description assistance" className="flex items-center gap-0.5">
                    <IconTooltip label="Write or improve with AI" description="Uses overview, schedule and location." hintOpen={aiHintOpen} onHintDismiss={() => setAiHintOpen(false)} disabledReason={generate.isPending ? 'Writing your overview…' : !name.trim() ? 'Enter a name first.' : undefined}><button type="button" disabled={!name.trim()} aria-label="Write or improve with AI" className={`${toolStyle} ${description.trim() ? 'yullo-ai-write' : ''}`} onClick={() => { setAiHintOpen(false); setFailure(''); generate.mutate(); }}><Bot size={18} strokeWidth={2.25} aria-hidden="true" /></button></IconTooltip>
                    <IconTooltip label="Copy the parent Space description" disabledReason={!parent.data?.description ? 'No parent description is available.' : undefined}><button type="button" disabled={!parent.data?.description} aria-label="Fill from company" className={toolStyle} onClick={() => setSuggestion({ text: parent.data!.description!, revision: parent.data!.revision })}><Building2 size={16} aria-hidden="true" /></button></IconTooltip>
                    <IconTooltip label="Undo the last description fill" disabledReason={!previous ? 'Apply a suggested description first.' : undefined}><button type="button" disabled={!previous} aria-label="Undo fill" className={toolStyle} onClick={() => { if (previous) { setDescription(previous.text); setCopiedRevision(previous.revision); setPrevious(null); } }}><RotateCcw size={16} aria-hidden="true" /></button></IconTooltip>
                  </div>
                </div>
                <textarea id={`overview-${spaceId}`} maxLength={SUBSPACE_DESCRIPTION_LIMIT} rows={3} className={`${dialogField} block min-h-[88px] resize-y`} placeholder={type === 'event' ? 'Purpose, audience and key information.' : 'A brief summary of what this Space covers.'} value={description} onChange={event => {
                  const value = event.target.value;
                  setDescription(value);
                  if (!value.trim()) setAiHintOpen(false);
                  else if (!aiHintShown.current) { aiHintShown.current = true; setAiHintOpen(true); }
                }} />
                <p className="mt-1.5 text-xs leading-5 text-[var(--text-secondary)]">Optional · Up to 4,000 characters</p>
              </div>
              {suggestion && <div className="rounded-md border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-sm"><p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Suggested overview</p><p className="mb-2 text-xs text-[var(--text-secondary)]">Review the draft and replace any [placeholders] before publishing.</p><p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words leading-6">{suggestion.text}</p><div className="mt-2 flex gap-2"><button type="button" className={quiet} onClick={() => { setPrevious({ text: description, revision: copiedRevision }); setDescription(suggestion.text); setCopiedRevision(suggestion.revision); setSuggestion(null); }}>Use description</button><button type="button" className={quiet} onClick={() => setSuggestion(null)}>Dismiss</button></div></div>}
              {type === 'event' && <div className="space-y-5">
                <div><h3 className="mb-3 text-[15px] font-medium">Schedule</h3><DateTimeField date={date} time={time} onDateChange={value => updateSchedule(value, time)} onTimeChange={value => updateSchedule(date, value)} disabled={save.isPending || generate.isPending} /></div>
                <div className="min-w-0 space-y-3">
                  <div className="flex items-center justify-between gap-3"><h3 className="text-[15px] font-medium">Location <span className="text-xs font-normal text-[var(--text-secondary)]">Optional</span></h3>{locationMode && <button type="button" className={`${quiet} text-xs`} onClick={() => setLocationMode(null)}>Clear</button>}</div>
                  <div role="group" aria-label="Event location format" className="flex gap-2">
                    {(['online', 'physical'] as const).map(mode => <button key={mode} type="button" aria-pressed={locationMode === mode} onClick={() => setLocationMode(mode)} className={`min-h-10 flex-1 rounded-lg border px-4 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${locationMode === mode ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-soft)]'}`}>{mode === 'online' ? 'Online' : 'Physical'}</button>)}
                  </div>
                  {!locationMode && <p className="text-sm leading-6 text-[var(--text-secondary)]">Online, physical, or leave unspecified.</p>}
                  {locationMode === 'online' && <label className={labelStyle}>Meeting link<input type="url" placeholder="https://" className={`${dialogField} mt-2`} value={meetingLink} onChange={event => setMeetingLink(event.target.value)} onBlur={() => { if (meetingLink.trim()) fillOverview(meetingLink.trim()); }} /><span className="mt-2 block text-xs font-normal leading-5 text-[var(--text-muted)]">Optional. You can add the link later.</span></label>}
                  {locationMode === 'physical' && <div className="space-y-3">
                    <LocationSearchField label="Venue or address" value={place} disabled={save.isPending || generate.isPending} onChange={value => { setPlace(value.slice(0, 300)); setPin(undefined); setLocationCountry(undefined); }} onSelect={selectVenue} onResolvingChange={setResolvingPlace} />
                    <GoogleLocationPicker compact initialPoint={pin} disabled={save.isPending || generate.isPending} onSelect={selectVenue} />
                    {pin && <a className={`${quiet} text-sm`} href={googleMapLink(pin)} target="_blank" rel="noopener noreferrer">View selected venue in Google Maps</a>}
                  </div>}
                </div>
              </div>}
              {type === 'job' && <label className={labelStyle}>Work location<input maxLength={300} placeholder="City, hybrid or remote" className={`${dialogField} mt-2`} value={place} onChange={event => setPlace(event.target.value)} /></label>}
              {(type === 'event' || type === 'service' || type === 'job') && <label className={labelStyle}>{type === 'job' ? 'Application URL' : type === 'event' ? 'Booking or registration link' : 'Booking URL'}<input type="url" placeholder="https://" pattern={type === 'event' ? 'https://.*' : undefined} className={`${dialogField} mt-2`} value={url} onChange={event => setUrl(event.target.value)} /><span className="mt-1 block text-xs font-normal leading-5 text-[var(--text-muted)]">Optional</span></label>}
              <DetailFields countryCode={locationMode === 'physical' ? locationCountry : undefined} value={detailFields} onChange={setDetailFields} disabled={busy} />
            </fieldset>
            <div className="mx-auto w-full max-w-[680px] px-1">
            {parent.isError && <p role="alert" className="px-5 pb-3 text-sm">Could not load company details. <button className={quiet} type="button" onClick={() => void parent.refetch()}>Retry</button></p>}
            {generate.isPending && <p role="status" className="px-5 pb-3 text-sm">Writing your overview…</p>}
            {failure && <p role="alert" className="px-5 pb-3 text-sm text-[var(--attention)]">{failure}</p>}
            </div>
            </div>
            <footer className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-6">
              <div className="mx-auto flex w-full max-w-[680px] flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[var(--text-secondary)]">Private<span className="hidden sm:inline"> until published</span></p>
                <div className="flex min-w-0 items-center gap-2">
                  <YulloButton variant="ghost" disabled={busy} onClick={() => setType(null)}>Cancel</YulloButton>
                  <YulloButton type="submit" isLoading={save.isPending} disabled={busy || scheduleIncomplete || !typeLabel.trim() || !name.trim() || !parent.data} className="min-w-0 !whitespace-normal"><span className="min-w-0 break-words">{save.isPending ? 'Saving…' : `Create ${itemLabel}`}</span></YulloButton>
                </div>
              </div>
            </footer>
          </form>
        </motion.section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}

export function Subspaces({ spaceId, display = 'header' }: { spaceId: string; display?: 'header' | 'sections'; purpose?: string }) {
  const [managing, setManaging] = useState(false);
  const query = useSpaceHierarchy(managing ? spaceId : undefined);
  const ownerId = useYulloAppStore(state => state.user?.id);
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();
  const [linking, setLinking] = useState(false);
  const [linkId, setLinkId] = useState('');
  const [failure, setFailure] = useState('');
  const nodes = query.data ?? [];
  const current = nodes.find(node => node.id === spaceId);
  const children = nodes.filter(node => node.parent_space_id === spaceId);
  const isSubspace = !!current?.parent_space_id;
  const listingTitle = isSubspace ? 'Related spaces' : 'Events, posts & services';
  const available = nodes.filter(node => node.id !== spaceId && !node.parent_space_id && node.active && node.status !== 'archived');
  const change = useMutation({ mutationFn: ({ node, ...patch }: { node: HierarchySpace; parent_space_id?: string | null; space_type?: SpaceType; type_label?: string }) => patchHierarchy(node, patch, ownerId!),
    onSuccess: async () => { setFailure(''); setLinking(false); setLinkId(''); await Promise.all([queryClient.invalidateQueries({ queryKey: hierarchyKey(ownerId) }), queryClient.invalidateQueries({ queryKey: ['yullo-home'] }), queryClient.invalidateQueries({ queryKey: ['identity'] }), queryClient.invalidateQueries({ queryKey: ['yullo', 'appearance'] }), queryClient.invalidateQueries({ queryKey: ['yullo-nearby', ownerId] })]); },
    onError: error => setFailure(errorMessage(error)) });
  return <div id={display === 'header' ? 'subspaces' : undefined} className={display === 'header' ? 'shrink-0' : undefined}>
    {display === 'sections' ? <div className="flex flex-col justify-between gap-4 py-6 md:flex-row md:items-center">
      <div><p className="font-[Satoshi] text-[18px] font-medium text-[var(--text-primary)]">{listingTitle}</p><p className="mt-1 text-[15px] text-[var(--text-secondary)]">{isSubspace ? `Add or explore spaces connected to this ${spaceItemLabel(current!.space_type, current?.type_label)}.` : 'View everything added to this Space.'}</p></div>
      <button type="button" onClick={() => { setLinking(false); setManaging(true); }} className={`${action} self-start px-5 py-2.5 text-[15px] font-medium md:self-auto`}>View</button>
    </div> : query.isError ? <button type="button" className={quiet} title="Reload Space actions" aria-label="Reload Space actions" onClick={() => void query.refetch()}><RefreshCw size={18} aria-hidden="true" /></button> : <AddSubspace disabled={query.isPending || !current?.active || current.status === 'archived'} spaceId={spaceId} onLink={() => { setManaging(true); setLinking(true); }} onManage={() => setManaging(true)} />}
    <Dialog.Root open={managing} onOpenChange={setManaging}><Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/40" />
      <Dialog.Content asChild><motion.section initial={reducedMotion ? false : { x: 16, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: reducedMotion ? 0 : 0.2 }} className="yullo-app fixed inset-y-0 right-0 z-[101] flex w-full max-w-[640px] flex-col border-l border-[var(--border)] bg-[var(--canvas)] p-6 text-[var(--text-primary)] shadow-xl min-[720px]:rounded-l-2xl">
        <div className="flex items-center justify-between gap-3"><Dialog.Title className="text-lg font-medium">{listingTitle}</Dialog.Title><div className="flex items-center gap-2">{children.length > 0 && current?.active && current.status !== 'archived' && <AddSubspace spaceId={spaceId} onLink={() => setLinking(true)} />}<Dialog.Close className={toolStyle} aria-label="Close"><X size={16} aria-hidden="true" /></Dialog.Close></div></div>
        <Dialog.Description className="mb-3 text-sm text-[var(--text-secondary)]">In {current?.name || 'this Space'}</Dialog.Description>
        <div className="min-h-0 flex-1 overflow-y-auto">
    {query.isPending ? <p role="status" className="py-3 text-sm">Loading…</p> : query.isError ? <p role="alert">Could not load subspaces. <button className={quiet} onClick={() => void query.refetch()}>Retry</button></p> : <>
      {!children.length && <div className="flex flex-col items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-8 text-center">{current?.active && current.status !== 'archived' && <AddSubspace spaceId={spaceId} onLink={() => setLinking(true)} />}<p className="mt-3 font-medium">What’s happening in your Space?</p><p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">Have an event, post or announcement to share? Click + to add it.</p></div>}
      {children.map(node => {
        const category = quickChoices.find(choice => choice.type === node.space_type) ?? quickChoices[3];
        const Icon = category.icon;
        const start = node.starts_at ? new Date(node.starts_at) : null;
        const schedule = start && !Number.isNaN(start.getTime()) ? `${start.toLocaleDateString(undefined, { dateStyle: 'medium' })} · ${start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' })}` : 'Schedule to be confirmed';
        const status = node.status === 'live' ? 'Live' : node.status === 'draft' ? 'Draft' : node.status === 'archived' ? 'Archived' : 'Unpublished';
        return <div key={node.id} className="flex items-start gap-2 border-b border-[var(--border)] py-4">
        <Link className="group flex min-h-20 min-w-0 flex-1 items-start gap-4 rounded-lg px-2 py-2 hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]" to={`/yullo/spaces/${node.id}`}>
          <span className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)]" style={{ color: `var(--space-type-${category.type})`, backgroundColor: `color-mix(in srgb, var(--space-type-${category.type}) 12%, var(--surface))` }}><Icon size={26} strokeWidth={2.25} aria-hidden="true" />{node.logo_url && <img src={node.logo_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" onError={event => { event.currentTarget.hidden = true; }} />}</span>
          <span className="min-w-0 flex-1"><span className="block break-words text-base font-semibold leading-6 text-[var(--text-primary)]">{node.name}</span><span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]"><span>{node.type_label || spaceTypeLabel(node.space_type)}</span><span aria-hidden="true">·</span><span>{status}</span></span>{node.space_type === 'event' && <span className="mt-2 block text-xs leading-5 text-[var(--text-secondary)]">{schedule}{node.location_label && <span className="mt-1 block break-words">{node.location_label}</span>}</span>}</span>
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--accent-ink)]"><span className="hidden sm:inline">Open</span><ArrowUpRight size={16} aria-hidden="true" /></span>
        </Link>
        <details className="relative"><summary className={`${quiet} cursor-pointer list-none`} aria-label={`Options for ${node.name}`} title="Options"><MoreHorizontal size={20} strokeWidth={2.25} aria-hidden="true" /></summary><div className="absolute right-0 z-10 w-72 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"><TypeEditor node={node} disabled={change.isPending || !node.active} onSave={label => change.mutate({ node, space_type: spaceTypeFromLabel(label), type_label: label })} /><button type="button" disabled={change.isPending} className={quiet} onClick={() => change.mutate({ node, parent_space_id: null })}>Detach</button></div></details>
      </div>; })}
      {current?.parent_space_id && <Link className={`${quiet} mt-2 text-sm`} to={`/yullo/spaces/${current.parent_space_id}`}>← Back to parent</Link>}
      {linking && <form className="mt-3 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); const node = available.find(item => item.id === linkId); if (node && !change.isPending) change.mutate({ node, parent_space_id: spaceId }); }}>
        <select aria-label="Choose an existing Space" required className={field} value={linkId} onChange={event => setLinkId(event.target.value)}><option value="">Choose a Space</option>{available.map(node => <option key={node.id} value={node.id}>{node.name}</option>)}</select>
        <button className={action} disabled={!linkId || change.isPending}>Link</button><button type="button" className={quiet} onClick={() => setLinking(false)}>Cancel</button>
      </form>}
    </>}
    {failure && <p role="alert" className="mt-3 text-sm text-[var(--attention)]">{failure}</p>}
        </div>
      </motion.section></Dialog.Content>
    </Dialog.Portal></Dialog.Root>
  </div>;
}


function TypeEditor({ node, disabled, onSave }: { node: HierarchySpace; disabled: boolean; onSave: (label: string) => void }) {
  const [label, setLabel] = useState(node.type_label || spaceTypeLabel(node.space_type));
  useEffect(() => { setLabel(node.type_label || spaceTypeLabel(node.space_type)); }, [node.type_label, node.space_type]);
  return <div className="min-w-56 space-y-2"><label htmlFor={`type-${node.id}`} className="text-sm">Type</label><CategoryCombobox id={`type-${node.id}`} value={label} onChange={value => setLabel(value === 'Other' ? '' : value)} suggestions={subspaceTypeSuggestions} itemLabel="type" maxLength={60} disabled={disabled} placeholder="Choose or enter a type" /><button type="button" className={quiet} disabled={disabled || !label.trim() || label === (node.type_label || spaceTypeLabel(node.space_type))} onClick={() => onSave(label.trim())}>Save type</button></div>;
}
