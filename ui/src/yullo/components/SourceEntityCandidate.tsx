import React, { useEffect, useMemo, useState } from 'react';
import { Check, Edit3, X, MinusCircle, ExternalLink } from 'lucide-react';
import { entitiesApi, SourceEntity } from '../api/entities';

type FieldKind = 'text' | 'textarea' | 'number' | 'list' | 'select';
type FieldDefinition = { key: string; label: string; kind?: FieldKind; options?: string[] };

const ENTITY_FIELDS: Record<string, FieldDefinition[]> = {
  offering: [
    { key: 'name', label: 'Name' },
    { key: 'description', label: 'Description', kind: 'textarea' },
    { key: 'price_amount', label: 'Price' },
    { key: 'currency', label: 'Currency' },
    { key: 'duration_minutes', label: 'Duration in minutes', kind: 'number' },
  ],
  location: [
    { key: 'name', label: 'Name' },
    { key: 'address', label: 'Address', kind: 'textarea' },
    { key: 'latitude', label: 'Latitude', kind: 'number' },
    { key: 'longitude', label: 'Longitude', kind: 'number' },
    { key: 'map_url', label: 'Map URL' },
  ],
  portfolio_item: [
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description', kind: 'textarea' },
    { key: 'media_urls', label: 'Media URLs', kind: 'list' },
    { key: 'project_url', label: 'Project URL' },
  ],
  contact_channel: [
    { key: 'label', label: 'Label' },
    { key: 'channel', label: 'Channel', kind: 'select', options: ['email', 'phone', 'website'] },
    { key: 'value', label: 'Value' },
  ],
  person: [
    { key: 'name', label: 'Name' },
    { key: 'role', label: 'Role' },
    { key: 'bio', label: 'Bio', kind: 'textarea' },
    { key: 'image_url', label: 'Image URL' },
  ],
  event: [
    { key: 'title', label: 'Title' },
    { key: 'starts_at', label: 'Starts at' },
    { key: 'ends_at', label: 'Ends at' },
    { key: 'location_entity_id', label: 'Location ID' },
    { key: 'registration_url', label: 'Registration URL' },
  ],
  action: [
    { key: 'label', label: 'Label' },
    { key: 'kind', label: 'Action type', kind: 'select', options: ['booking', 'enquiry', 'external_link'] },
    { key: 'destination_url', label: 'Destination URL' },
  ],
};

// Keep extraction/classification fields hidden. Owners edit only the content
// that a visitor will see or use.
const EDITABLE_ENTITY_FIELDS: Record<string, FieldDefinition[]> = {
  ...ENTITY_FIELDS,
  contact_channel: [
    { key: 'label', label: 'Name' },
    { key: 'value', label: 'Details' },
  ],
  action: [
    { key: 'label', label: 'Action text' },
    { key: 'destination_url', label: 'Destination URL' },
  ],
};

interface Props {
  spaceId: string;
  entity: SourceEntity;
  onChanged: () => void | Promise<void>;
}

function entityTitle(entity: SourceEntity): string {
  return String(
    entity.payload_json.title || entity.payload_json.name || entity.payload_json.label || 'Untitled detail'
  );
}

function safeLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

const ENTITY_LABELS: Record<string, string> = {
  contact_channel: 'Contact details', action: 'Useful links', offering: 'Services and capabilities',
  portfolio_item: 'Portfolio', location: 'Locations', person: 'People', event: 'Events',
};

function cleanPayload(
  fields: FieldDefinition[],
  values: Record<string, unknown>,
  original: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...original };
  for (const field of fields) {
    const value = values[field.key];
    delete payload[field.key];
    if (field.kind === 'list') {
      const list = String(value || '')
        .split('\n')
        .map(item => item.trim())
        .filter(Boolean);
      if (list.length) payload[field.key] = list;
    } else if (field.kind === 'number') {
      if (value !== '' && value !== null && value !== undefined) payload[field.key] = Number(value);
    } else if (String(value || '').trim()) {
      payload[field.key] = String(value).trim();
    }
  }
  return payload;
}

export const SourceEntityCandidate: React.FC<Props> = ({ spaceId, entity: incoming, onChanged }) => {
  const [entity, setEntity] = useState(incoming);
  const [draft, setDraft] = useState<Record<string, unknown>>(incoming.payload_json);
  const [mode, setMode] = useState<'view' | 'edit' | 'reject'>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = useMemo(() => EDITABLE_ENTITY_FIELDS[entity.entity_type] || [], [entity.entity_type]);

  useEffect(() => {
    setEntity(incoming);
    setDraft(incoming.payload_json);
  }, [incoming]);

  const run = async (operation: () => Promise<SourceEntity | any>) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await operation();
      setEntity(prev => ({ ...prev, ...updated }));
      setDraft(updated.payload_json || entity.payload_json);
      setMode('view');
      await onChanged();
    } catch (reason: any) {
      setError(reason?.response?.data?.detail || reason?.message || 'Could not update this detail.');
    } finally {
      setBusy(false);
    }
  };

  const confirmed = ['owner_confirmed', 'source_authoritative'].includes(entity.review_status);
  const rejected = entity.review_status === 'rejected';
  const inUse = confirmed && entity.is_public;
  const firstEvidence = entity.evidence?.[0];
  const excerpt = firstEvidence?.locator_metadata?.evidence_excerpt;
  const destination = safeLink(entity.entity_type === 'action' ? entity.payload_json.destination_url : entity.payload_json.channel === 'website' ? entity.payload_json.value : null);
  const sourceLink = safeLink(firstEvidence?.source_locator);

  return (
    <article className="border-t border-[var(--border)] py-5 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
            {ENTITY_LABELS[entity.entity_type] || entity.entity_type.replace(/_/g, ' ')}
          </p>
          <h5 className="mt-1 text-[16px] font-semibold text-[var(--text-primary)] font-[Satoshi]">
            {entityTitle(entity)}
          </h5>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={`text-[12px] font-medium ${inUse ? 'text-emerald-700 dark:text-emerald-400' : rejected ? 'text-rose-600' : 'text-[var(--text-secondary)]'}`}>
            {inUse ? 'In use' : rejected ? 'Rejected' : 'Not in use'}
          </span>
          {!rejected && mode === 'view' && (
            <div className="flex items-center gap-1 -mr-2">
              <button type="button" title="Edit" aria-label="Edit detail" onClick={() => setMode('edit')} className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)] transition-colors">
                <Edit3 className="h-4 w-4" />
              </button>
              <button type="button" title={inUse ? 'Stop using' : 'Use'} aria-label={inUse ? 'Stop using detail' : 'Use detail'} disabled={busy} onClick={() => run(() => entitiesApi.confirmEntity(spaceId, entity.id, entity.revision, !inUse))} className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors disabled:opacity-50 ${inUse ? 'text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]' : 'text-emerald-600 hover:bg-emerald-50'}`}>
                {inUse ? <MinusCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              </button>
              <button type="button" title="Reject" aria-label="Reject detail" onClick={() => setMode('reject')} className="flex h-11 w-11 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {mode === 'edit' ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {fields.map(field => {
            const current = Array.isArray(draft[field.key])
              ? (draft[field.key] as unknown[]).join('\n')
              : String(draft[field.key] ?? '');
            const className = "min-h-[46px] w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-[14px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-solid)]";
            return (
              <label key={field.key} className={field.kind === 'textarea' || field.kind === 'list' ? 'sm:col-span-2' : ''}>
                <span className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">{field.label}</span>
                {field.kind === 'select' ? (
                  <select className={className} value={current} onChange={event => setDraft(prev => ({ ...prev, [field.key]: event.target.value }))}>
                    {field.options?.map(option => <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>)}
                  </select>
                ) : field.kind === 'textarea' || field.kind === 'list' ? (
                  <textarea className={`${className} min-h-[92px] py-3`} value={current} onChange={event => setDraft(prev => ({ ...prev, [field.key]: event.target.value }))} />
                ) : (
                  <input className={className} type={field.kind === 'number' ? 'number' : 'text'} value={current} onChange={event => setDraft(prev => ({ ...prev, [field.key]: event.target.value }))} />
                )}
              </label>
            );
          })}
          <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => { setDraft(entity.payload_json); setMode('view'); }} className="min-h-[42px] px-3 text-[13px] text-[var(--text-secondary)]">Cancel</button>
            <button type="button" disabled={busy} onClick={() => run(() => entitiesApi.updateEntity(spaceId, entity.id, { payload_json: cleanPayload(fields, draft, entity.payload_json), expected_revision: entity.revision }))} className="min-h-[42px] rounded-xl bg-[var(--accent-solid)] px-4 text-[13px] font-semibold text-[var(--accent-on-solid)] disabled:opacity-50">Save</button>
          </div>
        </div>
      ) : (
        <>
          {['contact_channel', 'action'].includes(entity.entity_type) && (entity.payload_json.organization || entity.payload_json.purpose) && (
            <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
              {[entity.payload_json.organization, entity.payload_json.purpose].filter(Boolean).join(' · ')}
            </p>
          )}
          {excerpt && (
            <blockquote className="mt-3 border-l-2 border-[var(--accent-solid)] pl-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">
              “{String(excerpt)}”
            </blockquote>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 text-[12px] text-[var(--text-secondary)]">
            <span>{firstEvidence?.source_title || 'Linked to this source'}{firstEvidence?.locator_metadata?.page ? ` · Page ${firstEvidence.locator_metadata.page}` : ''}</span>
            {sourceLink && <a href={sourceLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1 underline underline-offset-4">Open source <ExternalLink className="h-3.5 w-3.5" /></a>}
            {destination && <a href={destination} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1 font-medium text-[var(--text-primary)] underline underline-offset-4">Open link <ExternalLink className="h-3.5 w-3.5" /></a>}
          </div>
          {(entity.evidence?.length || 0) > 1 && (
            <details className="mt-2 text-[12px] text-[var(--text-secondary)]">
              <summary className="min-h-[44px] cursor-pointer py-3">{entity.evidence?.length} source references</summary>
              {entity.evidence?.slice(1).map(reference => (
                <div key={reference.id} className="border-t border-[var(--border)] py-2">
                  <p>{reference.source_title || 'Source'}{reference.locator_metadata?.page ? ` · Page ${reference.locator_metadata.page}` : ''}{reference.locator_metadata?.section ? ` · ${reference.locator_metadata.section}` : ''}</p>
                  {reference.locator_metadata?.evidence_excerpt && <p className="mt-1 break-words">{String(reference.locator_metadata.evidence_excerpt)}</p>}
                </div>
              ))}
            </details>
          )}

        </>
      )}

      {mode === 'reject' && (
        <div className="mt-4 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-[13px] text-[var(--text-primary)]">
          Reject this extracted detail? Aura and the public page will stop using it.
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setMode('view')} className="min-h-[40px] px-3 text-[var(--text-secondary)]">Cancel</button>
            <button type="button" disabled={busy} onClick={() => run(() => entitiesApi.rejectEntity(spaceId, entity.id, entity.revision))} className="min-h-[40px] rounded-xl bg-rose-600 px-3 font-semibold text-white disabled:opacity-50">Reject detail</button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-3 text-[12px] text-rose-600">{error}</p>}
    </article>
  );
};
