import { YulloButton } from '../components/core/YulloButton';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Plus, ExternalLink, Pencil, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSpaceEntities } from '../api/entityQueries';
import type { SpaceEntity } from '../api/entities';
import { BookingForm } from './BookingForm';

export function BookingLinks({ spaceId, spaceName, itemLabel, compact = false }: { spaceId: string; spaceName: string; itemLabel?: string; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (compact) return <BookingList spaceId={spaceId} spaceName={spaceName} compact />;
  return (
    <section className="py-6 border-b border-[var(--border)]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="font-[Satoshi] text-[18px] font-medium text-[var(--text-primary)]">{itemLabel ? `${itemLabel.charAt(0).toUpperCase() + itemLabel.slice(1)} links & actions` : 'Booking'}</h3>
          </div>
          <p className="text-[15px] font-[Instrument_Sans] text-[var(--text-secondary)]">
            {itemLabel ? `Add booking or registration links for this ${itemLabel}.` : 'Manage your booking links and visitor access.'}
          </p>
        </div>
        <YulloButton variant="outline"
          type="button"
          aria-expanded={expanded}
          aria-controls="booking-links"
          onClick={() => setExpanded(!expanded)}
          className="min-h-11 px-5 rounded-lg text-[14px] font-[Instrument_Sans] font-medium transition-all cursor-pointer self-start md:self-auto bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 shadow-xs"
        >
          {itemLabel ? (expanded ? 'Close links' : 'Manage links') : (expanded ? 'Close booking links' : 'Manage booking links')}
        </YulloButton>
      </div>
      {expanded && <BookingList spaceId={spaceId} spaceName={spaceName} />}
    </section>
  );
}

function BookingList({ spaceId, spaceName, compact = false }: { spaceId: string; spaceName: string; compact?: boolean }) {
  const query = useSpaceEntities(spaceId);
  const [editor, setEditor] = useState<SpaceEntity | 'new' | null>(null);
  const [saved, setSaved] = useState(false);
  const bookings = (query.data ?? []).filter(
    entity => entity.entity_type === 'action' && entity.payload_json.kind === 'booking' && (!('is_active' in entity) || entity.is_active !== false)
  );
  const approved = bookings.filter(entity => ['owner_confirmed', 'source_authoritative'].includes(entity.review_status));
  const needsReview = bookings.some(entity => !['owner_confirmed', 'source_authoritative', 'rejected'].includes(entity.review_status));

  return (
    <div id="booking-links" className={compact ? "font-[Instrument_Sans]" : "mt-6 pt-5 border-t border-[var(--border)] font-[Instrument_Sans]"}>
      {query.isPending ? (
        <div role="status" className="py-6 flex items-center gap-2.5 text-[var(--text-secondary)] text-sm">
          <span className="w-4 h-4 border-2 border-[var(--accent-ink)] border-t-transparent rounded-full animate-spin" />
          <span>Loading booking links…</span>
        </div>
      ) : query.isError ? (
        <div role="alert" className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400 text-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Could not load booking links.</span>
          </div>
          <YulloButton variant="outline"
            type="button"
            onClick={() => void query.refetch()}
            className="min-h-9 px-3 rounded-lg text-sm font-medium text-[var(--accent-ink)] hover:underline cursor-pointer"
          >
            Try again
          </YulloButton>
        </div>
      ) : (
        <div className="space-y-4">
          {!approved.length ? (
            <div className="p-6 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-soft)] text-center">
              <div className="w-10 h-10 mx-auto rounded-xl bg-[var(--surface)] text-[var(--text-muted)] flex items-center justify-center mb-2.5">
                <Calendar className="w-5 h-5" />
              </div>
              <p className="text-[14px] text-[var(--text-secondary)] font-medium">No approved booking links yet.</p>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Add a link so visitors can book meetings or appointments with you.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {approved.map(entity => {
                let url: URL | null = null;
                try {
                  const parsed = new URL(entity.payload_json.destination_url);
                  if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) {
                    url = parsed;
                  }
                } catch {
                  /* Invalid saved links remain editable. */
                }

                return (
                  <div
                    key={entity.id}
                    className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] flex gap-4 ${compact ? "flex-col p-3" : "flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5"}`}
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[var(--accent-solid)]/10 text-[var(--accent-ink)] flex items-center justify-center shrink-0 mt-0.5">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="break-words font-semibold text-[16px] text-[var(--text-primary)]">
                            {entity.payload_json.label}
                          </p>
                          {entity.is_public ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Enabled for visitors
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--surface-soft)] text-[var(--text-muted)] border border-[var(--border)]">
                              Private
                            </span>
                          )}
                        </div>

                        {url && (
                          <div className="mt-1.5">
                            <a
                              href={url.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-[var(--accent-ink)] hover:underline break-all group"
                              aria-label={`Open booking page for ${entity.payload_json.label}`}
                            >
                              <span>{url.hostname}</span>
                              <ExternalLink className="w-3 h-3 opacity-70 group-hover:opacity-100" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      <YulloButton variant="outline"
                        type="button"
                        aria-label={`Edit ${entity.payload_json.label}`}
                        onClick={() => {
                          setSaved(false);
                          setEditor(entity);
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-[var(--surface-soft)] hover:bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] transition-all cursor-pointer shadow-2xs"
                      >
                        <Pencil className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                        <span>Edit</span>
                      </YulloButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {needsReview && (
            <Link
              to={`/yullo/spaces/${spaceId}/aura-knowledge`}
              className="p-3.5 rounded-xl border border-[var(--accent-solid)]/30 bg-[var(--accent-solid)]/5 hover:bg-[var(--accent-solid)]/10 text-sm font-medium text-[var(--accent-ink)] flex items-center justify-between transition-colors group"
            >
              <span>Review suggested booking links in What Aura knows →</span>
              <ArrowRight className="w-4 h-4 transform group-hover:translate-x-0.5 transition-transform" />
            </Link>
          )}

          <div className="pt-2">
            <YulloButton variant="outline"
              type="button"
              onClick={() => {
                setSaved(false);
                setEditor('new');
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-[var(--surface)] hover:bg-[var(--surface-soft)] text-[var(--accent-ink)] border border-[var(--border)] hover:border-[var(--accent-solid)]/40 transition-all cursor-pointer shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              <span>Add booking option</span>
            </YulloButton>
          </div>
        </div>
      )}

      {saved && (
        <div role="status" className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-sm font-medium flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Booking link saved.</span>
        </div>
      )}

      {editor && (
        <BookingForm
          spaceId={spaceId}
          spaceName={spaceName}
          entity={editor === 'new' ? undefined : editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setSaved(true);
          }}
        />
      )}
    </div>
  );
}
