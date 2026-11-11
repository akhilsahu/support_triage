import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSpaceEntities } from '../api/entityQueries';
import type { SpaceEntity } from '../api/entities';
import { LocationForm } from './LocationForm';

export function Locations({ spaceId }: { spaceId: string }) {
  const location = useLocation();
  const [expanded, setExpanded] = useState(location.hash === '#locations');
  return <section id="locations" className="scroll-mt-24 py-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="font-[Satoshi] text-lg font-medium">Locations</h3><p className="mt-1 text-[var(--text-secondary)]">Manage addresses, directions and public visibility.</p></div><button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="min-h-12 rounded-lg bg-[var(--accent-solid)] px-5 text-[var(--accent-on-solid)]">{expanded ? 'Close locations' : 'Manage locations'}</button></div>
    {expanded && <LocationList spaceId={spaceId} />}
  </section>;
}
function LocationList({ spaceId }: { spaceId: string }) {
  const query = useSpaceEntities(spaceId);
  const [editor, setEditor] = useState<SpaceEntity | 'new' | null>(null);
  const [saved, setSaved] = useState(false);
  const locations = (query.data ?? []).filter(e => e.entity_type === 'location' && (!('is_active' in e) || e.is_active !== false));
  const approved = locations.filter(e => ['owner_confirmed', 'source_authoritative'].includes(e.review_status));
  return <div className="mt-6 border-t border-[var(--border)]">
    {query.isPending ? <p role="status" className="py-4">Loading locations…</p> : query.isError ? <p role="alert">Could not load locations. <button type="button" onClick={() => void query.refetch()} className="min-h-12 text-[var(--accent-ink)]">Try again</button></p> : <>
      {!approved.length && <p className="py-4 text-[var(--text-secondary)]">No saved locations yet. Online-only Spaces can leave this empty.</p>}
      {approved.map(e => <div key={e.id} className="flex items-start justify-between gap-4 border-b border-[var(--border)] py-4"><div className="min-w-0"><p className="break-words font-medium">{e.payload_json.name}</p><p className="whitespace-pre-line break-words text-[var(--text-secondary)]">{e.payload_json.address}</p><p className="mt-2 text-sm">{e.is_public ? 'Public' : 'Private'}</p></div><button type="button" aria-label={`Edit ${e.payload_json.name}`} onClick={() => { setSaved(false); setEditor(e); }} className="min-h-12 px-3 text-[var(--accent-ink)]">Edit</button></div>)}
      {locations.some(e => !['owner_confirmed', 'source_authoritative', 'rejected'].includes(e.review_status)) && <Link to={`/yullo/spaces/${spaceId}/aura-knowledge`} className="flex min-h-12 items-center text-[var(--accent-ink)]">Review extracted locations in What Aura knows →</Link>}
      <button type="button" onClick={() => { setSaved(false); setEditor('new'); }} className="mt-3 min-h-12 text-[var(--accent-ink)]">+ Add location</button>
    </>}
    {saved && <p role="status">Location saved.</p>}
    {editor && <LocationForm spaceId={spaceId} entity={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setSaved(true); }} />}
  </div>;
}
