import type { QuickSpaceContext } from '../api/spaces';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe2, LockKeyhole, MapPin, Monitor, PencilLine, Plus } from 'lucide-react';
import { useSpaceEntities } from '../api/entityQueries';
import type { SpaceEntity } from '../api/entities';
import { LocationForm } from './LocationForm';
import { LocationMapPreview } from './LocationMapPreview';

export function Locations({ spaceId, eventContext, itemLabel }: { spaceId: string; eventContext?: QuickSpaceContext | null; itemLabel?: string }) {
  const query = useSpaceEntities(spaceId);
  const [editor, setEditor] = useState<SpaceEntity | 'new' | 'saved' | null>(null);
  const [saved, setSaved] = useState(false);
  const locations = (query.data ?? []).filter(e => e.entity_type === 'location' && (!('is_active' in e) || e.is_active !== false));
  const approved = locations.filter(e => ['owner_confirmed', 'source_authoritative'].includes(e.review_status));
  const hasSavedVenueRecord = (query.data ?? []).some(e => e.entity_type === 'location' && e.identity_key === 'event-venue');
  const savedVenue = !locations.length && !hasSavedVenueRecord && eventContext?.location_mode ? {
    name: eventContext.location_mode === 'online' ? 'Online / Remote' : 'Event venue',
    address: eventContext.place || '', isRemote: eventContext.location_mode === 'online',
    latitude: eventContext.latitude ?? null, longitude: eventContext.longitude ?? null,
    mapUrl: eventContext.map_url || '',
  } : null;
  const displayLocations = approved.map(e => ({ id: e.id, payload_json: e.payload_json, is_public: e.is_public, fromSavedEvent: false }));
  if (savedVenue && (savedVenue.isRemote || savedVenue.address)) displayLocations.push({
    id: 'saved-event-venue', is_public: false, fromSavedEvent: true,
    payload_json: { name: savedVenue.name, address: savedVenue.address, is_remote: savedVenue.isRemote,
      latitude: savedVenue.latitude, longitude: savedVenue.longitude },
  });
  return <section id="locations" className="scroll-mt-24 py-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="font-[Satoshi] text-lg font-medium">{itemLabel === 'event' ? 'Event location' : itemLabel ? `Locations for this ${itemLabel}` : 'Locations'}</h3><p className="mt-1 text-[var(--text-secondary)]">{itemLabel ? `Set the location for this ${itemLabel} and choose what visitors can see.` : 'Manage addresses, directions and public visibility.'}</p></div><button type="button" aria-label="Add location" title="Add location" onClick={() => { setSaved(false); setEditor('new'); }} className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"><Plus size={14} aria-hidden="true" /><MapPin size={18} aria-hidden="true" /></button></div>
    <div className={`mt-5 grid grid-cols-1 gap-3 ${displayLocations.filter(e => !e.payload_json.is_remote).length > 1 ? 'lg:grid-cols-2' : ''}`}>
    {query.isPending ? <p role="status" className="py-4 lg:col-span-full">Loading locations…</p> : query.isError ? <p role="alert">Could not load locations. <button type="button" onClick={() => void query.refetch()} className="min-h-12 text-[var(--accent-ink)]">Try again</button></p> : <>
      {!displayLocations.length && <p className="py-4 text-[var(--text-secondary)]">No saved locations yet. Add a place or an online location for discovery.</p>}
      {displayLocations.map(e => {
        const Icon = e.payload_json.is_remote ? Monitor : MapPin;
        const VisibilityIcon = e.is_public ? Globe2 : LockKeyhole;
        const color = 'var(--accent-ink)';
        return <div key={e.id} className={`yullo-location-row grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] content-start items-center gap-3 ${e.payload_json.is_remote ? 'lg:col-span-full py-1' : 'rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:gap-4'}`}>
          <span className="yullo-location-icon mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ color }}><Icon size={20} strokeWidth={1.75} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><p className="break-words font-medium">{e.payload_json.name}</p>{e.payload_json.is_remote && <span className="text-xs font-medium" style={{ color }}>Online / Remote</span>}</div>{!e.payload_json.is_remote && <p className="mt-1 max-w-xl whitespace-pre-line break-words text-sm leading-relaxed text-[var(--text-secondary)]">{e.payload_json.address}</p>}<p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"><VisibilityIcon size={13} aria-hidden="true" />{e.fromSavedEvent ? 'From saved event details' : e.is_public ? 'Public' : 'Private'}</p></div>
          <button type="button" aria-label={`Edit ${e.payload_json.name}`} onClick={() => { setSaved(false); setEditor(e.fromSavedEvent ? 'saved' : approved.find(item => item.id === e.id)!); }} className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] sm:px-3"><PencilLine size={14} aria-hidden="true" /><span>{e.fromSavedEvent ? 'Save location' : 'Edit'}</span></button>
          {!e.payload_json.is_remote && <div className="col-span-3 self-end"><LocationMapPreview name={e.payload_json.name} address={e.payload_json.address || ''} latitude={e.payload_json.latitude} longitude={e.payload_json.longitude} /></div>}
        </div>;
      })}
      {locations.some(e => !['owner_confirmed', 'source_authoritative', 'rejected'].includes(e.review_status)) && <Link to={`/yullo/spaces/${spaceId}/aura-knowledge`} className="flex min-h-12 items-center text-[var(--accent-ink)] lg:col-span-full">Review extracted locations in What Aura knows →</Link>}
    </>}
    </div>
    {saved && <p role="status">Location saved.</p>}
    {editor && <LocationForm spaceId={spaceId} entity={typeof editor === 'object' ? editor : undefined} initialValues={editor === 'saved' && savedVenue ? savedVenue : undefined} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setSaved(true); }} />}
  </section>;
}
