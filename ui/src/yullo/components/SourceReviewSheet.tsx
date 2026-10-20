import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, AlignLeft, Check, CheckCheck, CheckCircle2, Clock, Download, ExternalLink, FileText, Globe, Image as ImageIcon, MessageSquareText, MinusCircle, RotateCw, StopCircle, Trash2, X } from 'lucide-react';
import { SourceItem } from './SourceUnderstandingCard';
import { DeleteSourceConfirmDialog } from './DeleteSourceConfirmDialog';
import { SourceEntityCandidate } from './SourceEntityCandidate';
import { SourceFact, yulloOnboardingApi } from '../api/onboarding';
import { entitiesApi, SourceEntity } from '../api/entities';
import { ColouredIcon, getBrandIconFromUrl } from './ColouredIcon';

interface SourceReviewSheetProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: string;
  source: SourceItem | null;
  onToggleConfirm?: (sourceId: string, nextState: boolean) => void | Promise<void>;
  onRemoveSource?: (sourceId: string) => void | Promise<void>;
  onRetrySource?: (sourceId: string) => Promise<void>;
  onEntitiesChanged?: () => void | Promise<void>;
  onShowProgress?: () => void;
}

function factText(fact: SourceFact): string {
  const value = `${fact.label}: ${fact.value}`;
  return fact.note ? `${fact.subject} — ${value} — ${fact.note}` : `${fact.subject} — ${value}`;
}

function factStatus(fact: SourceFact): string {
  if (fact.review_status === 'owner_confirmed') return 'Confirmed';
  if (fact.review_status === 'source_authoritative') return 'Authoritative';
  if (fact.review_status === 'rejected') return 'Rejected';
  if (fact.review_status === 'superseded') return 'Superseded';
  return 'Candidate';
}

export const SourceReviewSheet: React.FC<SourceReviewSheetProps> = ({
  isOpen, onClose, spaceId, source, onToggleConfirm, onRemoveSource, onRetrySource, onEntitiesChanged, onShowProgress,
}) => {
  const [isConfirmed, setIsConfirmed] = useState(source?.is_confirmed ?? false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isReExtracting, setIsReExtracting] = useState(false);
  const [isLoadingReview, setIsLoadingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [facts, setFacts] = useState<SourceFact[]>([]);
  const [entities, setEntities] = useState<SourceEntity[]>([]);
  const [updatingFactId, setUpdatingFactId] = useState<string | null>(null);
  const [rejectingFactId, setRejectingFactId] = useState<string | null>(null);
  const [isConfirmingAll, setIsConfirmingAll] = useState(false);

  const sourceId = source?.id;
  const sourceIsProcessing = Boolean(source && ['uploaded', 'queued', 'running', 'processing', 'parsing_preview'].includes(source.status));
  const processing = sourceIsProcessing || isReExtracting;

  const loadReview = useCallback(async (background = false) => {
    if (!isOpen || !sourceId || !spaceId) return;
    if (!background) setIsLoadingReview(true);
    setReviewError(null);
    try {
      const [nextFacts, nextEntities] = await Promise.all([
        yulloOnboardingApi.getSourceFacts(spaceId, sourceId),
        entitiesApi.listSourceEntities(spaceId, sourceId),
      ]);
      setFacts(nextFacts);
      setEntities(nextEntities);
    } catch (reason: any) {
      setReviewError(reason?.response?.data?.detail || reason?.message || 'Could not load extracted details.');
    } finally {
      if (!background) setIsLoadingReview(false);
    }
  }, [isOpen, sourceId, spaceId]);

  useEffect(() => {
    setIsConfirmed(source?.is_confirmed ?? false);
  }, [source?.is_confirmed]);

  useEffect(() => {
    setFacts([]);
    setEntities([]);
  }, [sourceId]);

  useEffect(() => {
    // Stage/percentage updates should not refetch facts and entities every second.
    // Load on open/source change, then refresh when processing finishes.
    void loadReview();
  }, [loadReview, sourceIsProcessing]);

  if (!isOpen || !source) return null;

  const rawTitle = source.title || source.content_ref || '';
  const displayTitle = (rawTitle.includes('/') ? rawTitle.split('/').pop() || rawTitle : rawTitle)
    .replace(/^file_[a-f0-9]+_/i, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const displayRef = source.content_ref?.startsWith('http')
    ? source.content_ref
    : (source.content_ref?.split('/').pop() || source.content_ref || '').replace(/^file_[a-f0-9]+_/i, '');

  const brandIcon = source.source_type === 'url' ? getBrandIconFromUrl(source.content_ref || source.title) : null;
  const sourceIcon = brandIcon
    ? <ColouredIcon name={brandIcon} className="h-5 w-5" />
    : source.source_type === 'url'
      ? <Globe className="h-5 w-5 text-cyan-700 dark:text-cyan-400" />
      : ['document', 'file'].includes(source.source_type)
        ? <FileText className="h-5 w-5 text-violet-700 dark:text-violet-400" />
        : source.source_type === 'qna'
          ? <MessageSquareText className="h-5 w-5 text-amber-700 dark:text-amber-400" />
          : <AlignLeft className="h-5 w-5 text-blue-700 dark:text-blue-400" />;

  const handleReExtract = async () => {
    if (!onRetrySource) return;
    setIsReExtracting(true);
    setReviewError(null);
    try {
      await onRetrySource(source.id);
      onShowProgress?.();
    } catch (reason: any) {
      setReviewError(reason?.response?.data?.detail || reason?.message || 'Could not re-extract this source.');
    } finally {
      setIsReExtracting(false);
    }
  };

  const handleFactReview = async (fact: SourceFact, nextStatus: 'owner_confirmed' | 'rejected' | 'extracted') => {
    setUpdatingFactId(fact.id);
    setReviewError(null);
    try {
      const updated = await yulloOnboardingApi.reviewSourceFact(spaceId, source.id, fact.id, nextStatus, fact.review_status);
      setFacts(current => current.map(item => item.id === fact.id ? updated : item));
      await onEntitiesChanged?.();
    } catch (reason: any) {
      setReviewError(reason?.response?.data?.detail || reason?.message || 'Could not review this fact.');
    } finally {
      setUpdatingFactId(null);
      setRejectingFactId(null);
    }
  };

  const handleConfirmAll = async () => {
    if (!source || !spaceId) return;
    const unconfirmed = facts.filter(f => f.review_status !== 'owner_confirmed' && f.review_status !== 'rejected' && f.review_status !== 'source_authoritative' && f.review_status !== 'superseded');
    if (!unconfirmed.length) return;
    
    setIsConfirmingAll(true);
    setReviewError(null);
    try {
      await Promise.all(unconfirmed.map(async (fact) => {
        const updated = await yulloOnboardingApi.reviewSourceFact(spaceId, source.id, fact.id, 'owner_confirmed', fact.review_status);
        setFacts(current => current.map(item => item.id === fact.id ? updated : item));
      }));
      await onEntitiesChanged?.();
    } catch (reason: any) {
      setReviewError(reason?.response?.data?.detail || reason?.message || 'Could not confirm some facts.');
    } finally {
      setIsConfirmingAll(false);
    }
  };

  const handleEntityChanged = async () => {
    await loadReview(true);
    await onEntitiesChanged?.();
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/35 backdrop-blur-[2px] font-[Instrument_Sans]">
      <button type="button" aria-label="Close source review" className="absolute inset-0 cursor-default" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--surface)] shadow-2xl min-[720px]:max-w-[720px]" onClick={event => event.stopPropagation()}>
        <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-5 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]">{sourceIcon}</div>
            <div className="min-w-0">
              <h2 className="truncate font-[Satoshi] text-[19px] font-semibold text-[var(--text-primary)]">{displayTitle}</h2>
              <p className="truncate font-mono text-[12px] text-[var(--text-secondary)]">{displayRef}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close source review" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]"><X className="h-5 w-5" /></button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7">
          <section className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-center">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Source status</p>
              <div className="flex items-center gap-2">
                {source.status === 'failed' ? (
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-rose-600"><AlertCircle className="h-4 w-4" /> Failed</span>
                ) : ['ready', 'ready_to_review'].includes(source.status) ? (
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Ready</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-amber-700 dark:text-amber-400"><Clock className="h-4 w-4 animate-spin" /> Processing</span>
                )}
                <span className="text-[13px] text-[var(--text-secondary)]">
                  · {source.status === 'failed' ? 'Unavailable to Aura' : isConfirmed ? 'Used by Aura' : 'Paused'}
                </span>
              </div>
              {source.status === 'failed' && source.error_msg && (
                <p role="alert" className="mt-2 max-w-xl text-[12px] leading-relaxed text-rose-600">
                  {source.error_msg}
                </p>
              )}
            </div>
            <button type="button" onClick={handleReExtract} disabled={processing} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-4 text-[13px] font-medium text-[var(--text-primary)] disabled:opacity-50">
              <RotateCw className={`h-4 w-4 ${processing ? 'animate-spin' : ''}`} />
              {processing ? 'Re-extracting…' : 'Re-extract'}
            </button>
          </section>

          {processing && (
            <div aria-live="polite" className="mt-5 border-b border-[var(--border)] pb-5">
              <button type="button" onClick={onShowProgress} disabled={!onShowProgress} className="w-full text-left disabled:cursor-default">
                <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-2 text-[13px] text-[var(--text-primary)]">
                  <span>{sourceIsProcessing ? source.stage || (source.status === 'queued' ? 'Queued' : 'Processing source') : 'Starting re-extraction…'}</span>
                  <span>{sourceIsProcessing ? Math.max(0, Math.min(99, source.progress ?? 0)) : 0}%
                    {sourceIsProcessing && source.eta_seconds != null && source.eta_seconds > 0
                      ? ` · about ${source.eta_seconds < 60 ? `${source.eta_seconds}s` : `${Math.ceil(source.eta_seconds / 60)}m`} left`
                      : ' · Estimating time…'}
                  </span>
                </div>
                <div role="progressbar" aria-label="Source extraction progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={sourceIsProcessing ? Math.max(0, Math.min(99, source.progress ?? 0)) : 0} className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-soft)]">
                  <div className="h-full bg-[var(--accent-solid)] transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${sourceIsProcessing ? Math.max(0, Math.min(99, source.progress ?? 0)) : 0}%` }} />
                </div>
              </button>
              <p className="mt-3 text-[12px] text-[var(--text-secondary)]">Showing previous results while this source is processed. You can close this panel and return through the source’s progress indicator.</p>
            </div>
          )}

          {reviewError && <p role="alert" className="mt-5 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-[13px] text-rose-600">{reviewError}</p>}

          {/* Top Summary Metrics Strip for extracted items */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/60">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] block">Facts</span>
              <span className="text-[18px] font-bold font-[Satoshi] text-[var(--text-primary)]">{facts.length}</span>
            </div>
            <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/60">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] block">Entities</span>
              <span className="text-[18px] font-bold font-[Satoshi] text-[var(--text-primary)]">{entities.length}</span>
            </div>
            <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/60">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] block">Images</span>
              <span className="text-[18px] font-bold font-[Satoshi] text-[var(--text-primary)]">{source.assets?.images?.length || 0}</span>
            </div>
            <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/60">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] block">Documents</span>
              <span className="text-[18px] font-bold font-[Satoshi] text-[var(--text-primary)]">{source.assets?.documents?.length || 0}</span>
            </div>
          </div>

          {isLoadingReview ? (
            <div className="flex min-h-48 items-center justify-center text-[14px] text-[var(--text-secondary)]"><RotateCw className="mr-2 h-4 w-4 animate-spin" /> Loading extracted details…</div>
          ) : (
            <>
              <section className="py-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="font-[Satoshi] text-[17px] font-semibold text-[var(--text-primary)]">Detected facts</h3>
                    <p className="mt-1 text-[13px] text-[var(--text-secondary)]">Confirm accurate facts before Aura treats them as deterministic truth.</p>
                  </div>
                  {facts.filter(f => f.review_status !== 'owner_confirmed' && f.review_status !== 'rejected' && f.review_status !== 'source_authoritative' && f.review_status !== 'superseded').length > 0 && (
                    <button type="button" disabled={isConfirmingAll} onClick={handleConfirmAll} className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-xl bg-[var(--surface-soft)] px-3 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50">
                      <CheckCheck className={`h-4 w-4 ${isConfirmingAll ? 'animate-pulse' : ''}`} /> Confirm all
                    </button>
                  )}
                </div>
                <div className="mt-4 divide-y divide-[var(--border)]">
                  {facts.length === 0 ? (
                    <p className="py-4 text-[14px] text-[var(--text-secondary)]">{source.fact_extraction_status === 'failed' ? 'Fact extraction failed. Re-extract this source to try again.' : source.fact_extraction_status === 'candidates_rejected' ? 'Possible facts were found, but their evidence could not be verified. Re-extract to try again.' : 'No structured facts were saved. Aura can still search the indexed source.'}</p>
                  ) : facts.map(fact => {
                    const status = factStatus(fact);
                    const locked = ['source_authoritative', 'superseded'].includes(fact.review_status);
                    return (
                      <article key={fact.id} className="py-4 first:pt-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-[14px] leading-relaxed text-[var(--text-primary)]">{factText(fact)}</p>
                            <p className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">{fact.source_locator}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <span className={`text-[11px] font-semibold ${status === 'Confirmed' || status === 'Authoritative' ? 'text-emerald-700 dark:text-emerald-400' : status === 'Rejected' ? 'text-rose-600' : 'text-amber-700 dark:text-amber-400'}`}>{status}</span>
                            {!locked && (
                              <div className="flex items-center gap-1 -mr-2 mt-1">
                                {fact.review_status !== 'owner_confirmed' ? (
                                  <button type="button" title="Confirm" disabled={updatingFactId === fact.id} onClick={() => handleFactReview(fact, 'owner_confirmed')} className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-50">
                                    <Check className="h-4 w-4" />
                                  </button>
                                ) : (
                                  <button type="button" title="Stop using" disabled={updatingFactId === fact.id} onClick={() => handleFactReview(fact, 'extracted')} className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)] disabled:opacity-50">
                                    <MinusCircle className="h-4 w-4" />
                                  </button>
                                )}
                                {fact.review_status !== 'rejected' && (
                                  <button type="button" title="Reject" disabled={updatingFactId === fact.id} onClick={() => setRejectingFactId(fact.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">
                                    <X className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        {rejectingFactId === fact.id && (
                          <div className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-[13px] text-[var(--text-primary)]">
                            Reject this fact? It will not be used in Aura's answers.
                            <div className="mt-2 flex gap-2">
                              <button type="button" onClick={() => setRejectingFactId(null)} className="min-h-[36px] px-3 text-[var(--text-secondary)]">Cancel</button>
                              <button type="button" disabled={updatingFactId === fact.id} onClick={() => handleFactReview(fact, 'rejected')} className="min-h-[36px] rounded-xl bg-rose-600 px-3 font-semibold text-white disabled:opacity-50">Reject fact</button>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="border-t border-[var(--border)] py-7">
                <h3 className="font-[Satoshi] text-[17px] font-semibold text-[var(--text-primary)]">Structured page details</h3>
                <p className="mt-1 text-[13px] text-[var(--text-secondary)]">Review services, people, places and actions extracted from this source. Nothing becomes public automatically.</p>
                <div className="mt-5">
                  {entities.length === 0 ? (
                    <p className="py-4 text-[14px] text-[var(--text-secondary)]">No page details were extracted from this source.</p>
                  ) : entities.map(entity => <SourceEntityCandidate key={entity.id} spaceId={spaceId} entity={entity} onChanged={handleEntityChanged} />)}
                </div>
              </section>

              {/* Extracted Media & Assets */}
              {Boolean(source.preview_image_url || source.favicon_url || source.assets?.images?.length || source.assets?.documents?.length) && (
                <section className="border-t border-[var(--border)] py-7">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-[Satoshi] text-[17px] font-semibold text-[var(--text-primary)]">
                        Extracted media & assets
                      </h3>
                      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                        Visual branding, page images, and linked documents pulled from this source.
                      </p>
                    </div>
                  </div>

                  {/* Brand & Social Preview Card */}
                  {(source.preview_image_url || source.assets?.images?.[0]?.url) && (
                    <div className="mt-4 rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--surface-soft)]/50">
                      <div className="relative aspect-video max-h-52 w-full overflow-hidden bg-[var(--surface-soft)]">
                        <img
                          src={source.preview_image_url || source.assets?.images?.[0]?.url}
                          alt="Social preview"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          className="h-full w-full object-cover"
                          onError={(e) => { ((e.currentTarget as HTMLElement).parentElement as HTMLElement).style.display = 'none'; }}
                        />
                      </div>
                      <div className="p-3 text-[12px] text-[var(--text-secondary)] flex items-center justify-between">
                        <span>Page preview / social banner</span>
                        <a
                          href={source.preview_image_url || source.assets?.images?.[0]?.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[var(--accent-ink)] hover:underline"
                        >
                          View full image <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Content Images Grid */}
                  {Boolean(source.assets?.images?.length) && (
                    <div className="mt-5 space-y-3">
                      <h4 className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                        Page Images ({source.assets!.images!.length})
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {source.assets!.images!.map((img, idx) => (
                          <a
                            key={idx}
                            href={img.url}
                            target="_blank"
                            rel="noreferrer"
                            className="group relative rounded-lg border border-[var(--border)] overflow-hidden bg-[var(--surface-soft)] hover:border-[var(--accent)] transition-all flex flex-col"
                          >
                            <div className="aspect-square w-full bg-[var(--surface-soft)]/80 flex items-center justify-center overflow-hidden">
                              <img
                                src={img.url}
                                alt={img.alt || 'Extracted content image'}
                                referrerPolicy="no-referrer"
                                loading="lazy"
                                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                                onError={(e) => {
                                  ((e.currentTarget as HTMLElement).parentElement as HTMLElement).innerHTML = '<div class="p-2 text-center text-[10px] text-[var(--text-muted)]">Image unavailable</div>';
                                }}
                              />
                            </div>
                            {img.alt && (
                              <p className="p-1.5 text-[11px] text-[var(--text-secondary)] truncate font-[Instrument_Sans]">
                                {img.alt}
                              </p>
                            )}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Downloadable Documents */}
                  {Boolean(source.assets?.documents?.length) && (
                    <div className="mt-5 space-y-3">
                      <h4 className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                        Linked Documents ({source.assets!.documents!.length})
                      </h4>
                      <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/40 overflow-hidden">
                        {source.assets!.documents!.map((doc, idx) => (
                          <div key={idx} className="p-3 flex items-center justify-between gap-3 text-[13px]">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <FileText className="w-4 h-4 text-violet-500 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-[var(--text-primary)] truncate">{doc.title || doc.filename}</p>
                                <p className="text-[11px] text-[var(--text-muted)] uppercase">{doc.file_type}</p>
                              </div>
                            </div>
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors shrink-0"
                            >
                              <Download className="w-3.5 h-3.5 text-[var(--text-secondary)]" /> Open
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Contextual Links */}
                  {Boolean((source.assets as any)?.links?.length) && (
                    <div className="mt-5 space-y-3">
                      <h4 className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                        Contextual Links ({(source.assets as any)!.links!.length})
                      </h4>
                      <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/40 overflow-hidden">
                        {(source.assets as any)!.links!.map((link: any, idx: number) => (
                          <div key={idx} className="p-3 flex items-center justify-between gap-3 text-[13px]">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-[var(--text-primary)] truncate font-[Satoshi]">{link.title || link.url}</p>
                              {link.context_text && (
                                <p className="text-[11px] text-[var(--text-muted)] italic truncate">"{link.context_text}"</p>
                              )}
                            </div>
                            <a
                              href={link.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors shrink-0"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-[var(--text-secondary)]" /> Visit
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>

        <footer className="flex items-center gap-3 border-t border-[var(--border)] bg-[var(--surface-soft)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-7">
          <button type="button" onClick={async () => { const next = !isConfirmed; setIsConfirmed(next); await onToggleConfirm?.(source.id, next); onClose(); }} className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--accent-solid)] px-4 text-[14px] font-semibold text-[var(--accent-on-solid)]">
            <StopCircle className="h-4 w-4" /> {isConfirmed ? 'Stop using source' : 'Resume using source'}
          </button>
          <button type="button" aria-label="Remove source" onClick={() => setShowDeleteConfirm(true)} className="flex h-[46px] w-[46px] items-center justify-center rounded-xl border border-rose-500/25 bg-rose-500/10 text-rose-600"><Trash2 className="h-4 w-4" /></button>
        </footer>
      </aside>

      <DeleteSourceConfirmDialog
        isOpen={showDeleteConfirm}
        sourceTitle={displayTitle}
        onConfirm={async () => { setShowDeleteConfirm(false); await onRemoveSource?.(source.id); onClose(); }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
};
