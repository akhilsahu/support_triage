import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Plus, Upload, FileText, Globe, ImagePlus,
  FolderOpen, HelpCircle, Clock, MoreHorizontal, Trash2, Eye, RefreshCw, AlertCircle,
  CheckCircle2, Loader2, Check, X, Bell, Database
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { SourceDeletionMode, SourceFact, yulloOnboardingApi } from '../../api/onboarding';
import { useSpaceEntities } from '../../api/entityQueries';
import { formsApi } from '../../api/forms';
import { PublicResourceToggle } from '../../components/PublicResourceToggle';
import { SourceItem } from '../../components/SourceUnderstandingCard';
import { SourceReviewSheet } from '../../components/SourceReviewSheet';
import { AddKnowledgeModal, KnowledgeModalTab } from '../../components/AddKnowledgeModal';
import { LinkPreviewModal } from '../../components/LinkPreviewModal';
import { DeleteSourceConfirmDialog } from '../../components/DeleteSourceConfirmDialog';
import { ReuploadConfirmDialog } from '../../components/ReuploadConfirmDialog';
import { FullSpaceKnowledgePreviewModal } from '../../components/FullSpaceKnowledgePreviewModal';
import { ProcessingDetailsModal } from '../../components/ProcessingDetailsModal';
import { SourceExcerptModal } from '../../components/SourceExcerptModal';
import { ExtractionResultsModal } from '../../components/ExtractionResultsModal';
import { KnowledgeCleanupReviewDialog } from '../../components/KnowledgeCleanupReviewDialog';
import { VectorChunksManagerModal } from '../../components/VectorChunksManagerModal';

export const AuraKnowledgeScreen: React.FC = () => {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();

  const [sources, setSources] = useState<SourceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryingSourceId, setRetryingSourceId] = useState<string | null>(null);
  
  // Custom dialogs state
  const [reuploadSource, setReuploadSource] = useState<SourceItem | null>(null);
  const [completedExtractionSource, setCompletedExtractionSource] = useState<SourceItem | null>(null);
  const processingSourceIdsRef = React.useRef<Set<string>>(new Set());
  const removedSourceIdsRef = React.useRef<Set<string>>(new Set());
  // Review Sheet State
  const [selectedReviewSource, setSelectedReviewSource] = useState<SourceItem | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  // Add Knowledge Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalTab, setAddModalTab] = useState<KnowledgeModalTab>('link');

  // Delete Confirmation State
  const [deleteConfirmSource, setDeleteConfirmSource] = useState<SourceItem | null>(null);
  const [isDeletingSource, setIsDeletingSource] = useState(false);
  const [isCleanupReviewOpen, setIsCleanupReviewOpen] = useState(false);

  // Overflow Menu State
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Processing Details Modal State
  const [processingSource, setProcessingSource] = useState<SourceItem | null>(null);

  // Excerpt Modal State
  const [excerptSource, setExcerptSource] = useState<SourceItem | null>(null);

  // Facts Expansion State
  const [isFactsExpanded, setIsFactsExpanded] = useState(false);

  // Link Preview viewing state
  const [previewViewingSource, setPreviewViewingSource] = useState<SourceItem | null>(null);
  const [dismissedPreviewIds, setDismissedPreviewIds] = useState<Set<string>>(new Set());

  // Vector Chunks Sheets Modal State
  const [isVectorChunksOpen, setIsVectorChunksOpen] = useState(false);
  const [vectorChunksSourceId, setVectorChunksSourceId] = useState<string | undefined>(undefined);

  const [identityData, setIdentityData] = useState<any>(null);
  // Entity State
  const { data: entities = [], isLoading: isLoadingEntities, refetch: refetchEntities } = useSpaceEntities(spaceId || '');
  const sourceIds = sources.map(source => `${source.id}:${source.source_version ?? 0}`).sort();
  const { data: factGroups = [], isLoading: isLoadingFacts, isError: factsFailed, refetch: refetchFacts } = useQuery({
    queryKey: ['yullo-knowledge-facts', spaceId, sourceIds],
    enabled: Boolean(spaceId) && sources.length > 0,
    queryFn: async () => Promise.all(sources.filter(source => !removedSourceIdsRef.current.has(source.id)).map(async source => ({
      sourceId: source.id,
      facts: await yulloOnboardingApi.getSourceFacts(spaceId!, source.id),
    }))),
  });
  const { data: cleanupAlerts = [], refetch: refetchCleanupAlerts } = useQuery({
    queryKey: ['yullo-knowledge-cleanup-alerts', spaceId],
    enabled: Boolean(spaceId),
    queryFn: () => yulloOnboardingApi.getKnowledgeCleanupAlerts(spaceId!),
  });
  const visibleFacts = factGroups.flatMap(group => group.facts)
    .filter(fact => !removedSourceIdsRef.current.has(fact.source_item_id) && !['rejected', 'superseded'].includes(fact.review_status));
  const confirmedFacts = visibleFacts.filter(fact => fact.verified);
  const sourceForFact = (fact: SourceFact) => sources.find(source => source.id === fact.source_item_id);

  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  useEffect(() => {
    if (spaceId) {
      formsApi.getIdentity(spaceId).then(setIdentityData).catch(() => {});
    }
  }, [spaceId]);

  const fetchSources = useCallback(async () => {
    if (!spaceId) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await yulloOnboardingApi.getSpaceSources(spaceId);
      setSources((data || []).filter((source: SourceItem) => !removedSourceIdsRef.current.has(source.id)));
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load knowledge sources');
    } finally {
      setIsLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const hasProcessingSource = sources.some(source =>
    ['uploaded', 'queued', 'running', 'processing', 'parsing_preview'].includes(source.status)
  );

  useEffect(() => {
    const currentProcessing = new Set(
      sources
        .filter(s => ['uploaded', 'queued', 'running', 'processing', 'parsing_preview'].includes(s.status))
        .map(s => s.id)
    );
    processingSourceIdsRef.current = currentProcessing;
  }, [sources]);

  useEffect(() => {
    if (!spaceId || !hasProcessingSource) return;

    const url = yulloOnboardingApi.streamSpaceSourcesUrl(spaceId);
    const eventSource = new EventSource(url, { withCredentials: true });

    eventSource.addEventListener('update', (e) => {
      try {
        const next = (JSON.parse(e.data) as SourceItem[]).filter(source => !removedSourceIdsRef.current.has(source.id));
        setSources(next);
        if (!next.some(source => ['uploaded', 'queued', 'running', 'processing', 'parsing_preview'].includes(source.status))) {
          Promise.all([refetchEntities(), refetchFacts()]).catch(console.error);
          eventSource.close();
        }
      } catch (err) {
        console.error('SSE Error parsing update', err);
      }
    });

    eventSource.addEventListener('error', (e) => {
      console.error('SSE Connection Error', e);
      // EventSource automatically attempts to reconnect on error,
      // but if the server completely dropped or it's a 401/403, we might need to handle it.
      // We will let the native reconnect handle temporary drops.
    });

    return () => {
      eventSource.close();
    };
  }, [spaceId, hasProcessingSource, refetchEntities, refetchFacts]);

  // Handlers for Add Knowledge
  const handleAddLink = async (url: string, title?: string, background: boolean = true) => {
    if (!spaceId) return;
    const source = await yulloOnboardingApi.addSourceUrl(url, 'url', spaceId, title, background);
    await fetchSources();
    return source;
  };

  const handleUploadFile = async (file: File) => {
    if (!spaceId) return;
    const res = await yulloOnboardingApi.addSourceFile(file, spaceId);
    await fetchSources();
    return res.id;
  };

  const handleAddText = async (title: string, text: string) => {
    if (!spaceId) return;
    await yulloOnboardingApi.addSourceText(text, spaceId, title);
    await fetchSources();
  };

  // Handlers for Source Review & Removal
  const handleToggleConfirm = async (sourceId: string, nextState: boolean) => {
    try {
      await yulloOnboardingApi.updateSource(sourceId, { is_confirmed: nextState });
      await fetchSources();
    } catch (err: any) {
      console.error('Failed to toggle source confirmation:', err);
    }
  };

  const handleConfirmAllFacts = async (sourceId: string) => {
    if (!spaceId) return;
    try {
      const sourceFacts = await yulloOnboardingApi.getSourceFacts(spaceId, sourceId);
      const unconfirmed = sourceFacts.filter(
        f => f.review_status !== 'owner_confirmed' && f.review_status !== 'rejected' && f.review_status !== 'source_authoritative' && f.review_status !== 'superseded'
      );
      if (unconfirmed.length > 0) {
        await Promise.all(
          unconfirmed.map(fact =>
            yulloOnboardingApi.reviewSourceFact(spaceId, sourceId, fact.id, 'owner_confirmed', fact.review_status)
          )
        );
      }
      await Promise.all([fetchSources(), refetchEntities(), refetchFacts()]);
    } catch (err: any) {
      console.error('Failed to confirm all facts:', err);
      throw err;
    }
  };

  const handleRemoveSource = async (
    sourceId: string,
    mode: SourceDeletionMode = 'purge',
    expectedSourceVersion?: number,
  ) => {
    try {
      await yulloOnboardingApi.deleteSource(sourceId, mode, expectedSourceVersion);
      // An older fetch/SSE update must not resurrect a source just removed.
      removedSourceIdsRef.current.add(sourceId);
      setSources(prev => prev.filter(s => s.id !== sourceId));
      processingSourceIdsRef.current.delete(sourceId);
      setProcessingSource(current => current?.id === sourceId ? null : current);
      setCompletedExtractionSource(current => current?.id === sourceId ? null : current);
      setExcerptSource(current => current?.id === sourceId ? null : current);
      setPreviewViewingSource(current => current?.id === sourceId ? null : current);
      setReuploadSource(current => current?.id === sourceId ? null : current);
      if (selectedReviewSource?.id === sourceId) {
        setSelectedReviewSource(null);
        setIsReviewOpen(false);
      }
      if (vectorChunksSourceId === sourceId) {
        setIsVectorChunksOpen(false);
        setVectorChunksSourceId(undefined);
      }
      await Promise.all([refetchCleanupAlerts(), refetchEntities(), refetchFacts()]);
    } catch (err: any) {
      console.error('Failed to remove source:', err);
      throw err;
    }
  };

  const handleRetrySource = async (sourceId: string) => {
    if (!spaceId) return;
    
    const source = sources.find(s => s.id === sourceId);
    if (source) {
      const errorMsg = source.error_msg || source.fact_extraction_error || source.entity_extraction_error || '';
      if (errorMsg.toLowerCase().includes('re-upload')) {
        setReuploadSource(source);
        throw new Error(errorMsg || "Context processing failed, please re-upload the file");
      }
    }
    
    await yulloOnboardingApi.retrySource(spaceId, sourceId);
    // Keep progress available even if the first refresh fails after an accepted retry.
    setSources(previous => previous.map(item => item.id === sourceId
      ? { ...item, status: 'queued', progress: 0, stage: 'Queued', eta_seconds: undefined }
      : item));
    await fetchSources();
  };

  const handleRetryFailedSource = async (sourceId: string) => {
    setRetryingSourceId(sourceId);
    setErrorMsg(null);
    try {
      await handleRetrySource(sourceId);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || err?.message || 'Failed to retry source');
    } finally {
      setRetryingSourceId(null);
    }
  };

  const openAddModal = (tab: KnowledgeModalTab) => {
    setAddModalTab(tab);
    setIsAddModalOpen(true);
  };

  const handleOpenReview = (source: SourceItem) => {
    setSelectedReviewSource(source);
    setIsReviewOpen(true);
  };

  // Helper for source type colors and icons with high contrast light-mode colors
  const getSourceTypeStyle = (sourceType: string) => {
    switch (sourceType) {
      case 'url':
        return {
          bg: 'bg-cyan-500/15 dark:bg-cyan-400/15',
          border: 'border-cyan-500/30 dark:border-cyan-400/30',
          text: 'text-cyan-700 dark:text-cyan-400',
          icon: <Globe className="w-4 h-4 text-cyan-700 dark:text-cyan-400" />
        };
      case 'document':
      case 'file':
        return {
          bg: 'bg-violet-500/15 dark:bg-violet-400/15',
          border: 'border-violet-500/30 dark:border-violet-400/30',
          text: 'text-violet-700 dark:text-violet-400',
          icon: <FileText className="w-4 h-4 text-violet-700 dark:text-violet-400" />
        };
      case 'qna':
      case 'web':
        return {
          bg: 'bg-amber-500/15 dark:bg-amber-400/15',
          border: 'border-amber-500/30 dark:border-amber-400/30',
          text: 'text-amber-700 dark:text-amber-400',
          icon: <HelpCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        };
      default:
        return {
          bg: 'bg-blue-500/15 dark:bg-blue-400/15',
          border: 'border-blue-500/30 dark:border-blue-400/30',
          text: 'text-blue-700 dark:text-blue-400',
          icon: <FileText className="w-4 h-4 text-blue-700 dark:text-blue-400" />
        };
    }
  };

  const primaryCategory = identityData?.category || identityData?.purpose || 'Category not set';
  const offeringCount = entities.filter(entity => entity.entity_type === 'offering').length;
  const presenceLabel = identityData?.presence
    ? String(identityData.presence).replace('_', ' ')
    : 'Presence not set';

  const activeProcessingSources = sources.filter(s =>
    ['uploaded', 'queued', 'running', 'processing', 'parsing_preview'].includes(s.status)
  );

  const readyPreviewSources = sources.filter(s =>
    factGroups.some(group => group.sourceId === s.id && group.facts.some(fact => fact.review_status === 'extracted')) &&
    ['ready', 'ready_to_review'].includes(s.status) &&
    !dismissedPreviewIds.has(s.id)
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end max-[899px]:top-0 max-[899px]:h-full min-[900px]:top-[72px] min-[900px]:h-[calc(100dvh-72px)] font-[Instrument_Sans]">
      {/* Backdrop Overlay */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity cursor-pointer duration-300"
        onClick={() => navigate(`/yullo/spaces/${spaceId}`)}
      />

      {/* Slide Pull-Out Sheet Drawer */}
      <div className="relative z-10 w-full h-full max-[899px]:w-full min-[900px]:w-[min(1080px,85vw)] bg-[var(--canvas)] text-[var(--text-primary)] shadow-2xl flex flex-col min-[900px]:rounded-l-2xl overflow-y-auto animate-in slide-in-from-right duration-200">
        {/* Top Editorial Header */}
        <div className="max-w-[1000px] w-full mx-auto px-8 py-8">
          <button
            onClick={() => navigate(`/yullo/spaces/${spaceId}`)}
            className="inline-flex items-center gap-2 text-[14px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-6 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Space
          </button>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-[Satoshi] text-[32px] font-bold text-[var(--text-primary)] tracking-tight leading-tight">
                  What Aura knows
                </h1>
                <button
                  type="button"
                  onClick={() => setIsCleanupReviewOpen(true)}
                  aria-label={cleanupAlerts.length > 0
                    ? `${cleanupAlerts.length} knowledge ${cleanupAlerts.length === 1 ? 'review' : 'reviews'} pending`
                    : 'Knowledge review notifications'}
                  title={cleanupAlerts.length > 0 ? 'Review unsupported knowledge' : 'No knowledge reviews pending'}
                  className={`relative inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${cleanupAlerts.length > 0 ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300' : 'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                  <Bell className="h-4 w-4" />
                  {cleanupAlerts.length > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-rose-600 px-1.5 py-0.5 text-center text-[10px] font-bold leading-4 text-white">
                      {cleanupAlerts.length > 99 ? '99+' : cleanupAlerts.length}
                    </span>
                  )}
                </button>
              </div>
              <p className="text-[15px] text-[var(--text-secondary)] mt-1 font-[Instrument_Sans]">
                Everything Aura can learn from for this Space.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 font-[Instrument_Sans]">
              <button
                type="button"
                onClick={() => {
                  setVectorChunksSourceId(undefined);
                  setIsVectorChunksOpen(true);
                }}
                className="h-[44px] w-[44px] rounded-xl bg-[var(--surface-soft)] text-sky-500 hover:text-sky-400 hover:bg-[var(--border)] border border-[var(--border)] transition-colors flex items-center justify-center cursor-pointer shrink-0"
                title="View Vector Chunks & Embeddings (Sheets View)"
                aria-label="View Vector Chunks"
              >
                <Database className="w-4 h-4" />
              </button>

              <button type="button" onClick={() => openAddModal('images')} className="flex h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"><ImagePlus size={17} aria-hidden="true" />Add images</button>

              <button
                onClick={() => openAddModal('text')}
                className="px-5 h-[44px] rounded-xl text-[14px] font-bold shadow-xs transition-all flex items-center gap-2 cursor-pointer hover:opacity-90 active:scale-[0.99]"
                style={{
                  backgroundColor: 'var(--accent-solid)',
                  color: 'var(--accent-on-solid)'
                }}
              >
                <Plus className="w-4 h-4 stroke-[3]" /> Add source
              </button>

              <button
                onClick={() => openAddModal('link')}
                className="px-3.5 h-[44px] rounded-xl bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 text-[13px] font-medium transition-colors flex items-center gap-2 border border-transparent cursor-pointer"
              >
                <Globe className="w-4 h-4 text-cyan-700 dark:text-cyan-400" /> Add link
              </button>
              
              <button
                onClick={() => openAddModal('upload')}
                className="px-3.5 h-[44px] rounded-xl bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 text-[13px] font-medium transition-colors flex items-center gap-2 border border-transparent cursor-pointer"
              >
                <Upload className="w-4 h-4 text-violet-700 dark:text-violet-400" /> Upload file
              </button>

            </div>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="py-12 text-center text-[var(--text-secondary)] font-[Instrument_Sans]">
              <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              Loading knowledge sources...
            </div>
          )}

          {/* Error State */}
          {errorMsg && (
            <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-md text-rose-500 text-[14px] font-[Instrument_Sans]">
              {errorMsg}
            </div>
          )}

          {!isLoading && (
            <div className="space-y-12 pb-16">
              {/* Active Background Tasks Progress Section */}
              {activeProcessingSources.length > 0 && (
                <div className="space-y-3">
                  {activeProcessingSources.map(procSource => {
                    const rawTitle = procSource.title || procSource.content_ref || '';
                    const displayTitle = rawTitle.includes('/') ? rawTitle.split('/').pop() || rawTitle : rawTitle;
                    const progress = procSource.progress ?? 30;
                    const stageText = procSource.stage || 'Generating preview in background…';

                    return (
                      <div 
                        key={procSource.id}
                        onClick={() => setProcessingSource(procSource)}
                        className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/70 hover:bg-[var(--surface-soft)] hover:border-[var(--accent)]/50 p-4 shadow-xs space-y-2.5 animate-in fade-in duration-200 cursor-pointer transition-all group"
                        title="Click to view live processing stages and progress details"
                      >
                        <div className="flex items-center justify-between gap-3 text-[13px]">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)] shrink-0" />
                            <span className="font-semibold text-[var(--text-primary)] truncate font-[Satoshi] group-hover:text-[var(--accent-ink)] transition-colors">
                              {displayTitle}
                            </span>
                            <span className="text-[12px] text-[var(--text-secondary)] hidden sm:inline">
                              · {stageText}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[12px] font-mono text-[var(--text-secondary)]">
                              {progress}%
                            </span>
                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] font-medium group-hover:border-[var(--accent)] group-hover:text-[var(--accent-ink)] transition-colors hidden sm:inline-flex items-center gap-1">
                              View details
                            </span>
                          </div>
                        </div>

                        <div className="w-full bg-[var(--surface)] h-2 rounded-full overflow-hidden border border-[var(--border)]/60">
                          <div 
                            className="h-full bg-[var(--accent)] transition-all duration-500 rounded-full"
                            style={{ width: `${Math.max(progress, 15)}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                          <span>Running in background — click to view step-by-step progress.</span>
                          {procSource.eta_seconds && procSource.eta_seconds > 0 ? (
                            <span className="font-mono">~{procSource.eta_seconds}s remaining</span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Ready Link Previews Notification Banner */}
              {readyPreviewSources.length > 0 && (
                <div className="space-y-3">
                  {readyPreviewSources.map(readySource => {
                    const rawTitle = readySource.title || readySource.content_ref || '';
                    const displayTitle = rawTitle.includes('/') ? rawTitle.split('/').pop() || rawTitle : rawTitle;

                    return (
                      <div 
                        key={readySource.id}
                        className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-200"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-[Satoshi] font-semibold text-[14px] text-[var(--text-primary)]">
                                Facts ready for review
                              </span>
                              <span className="text-[12px] px-2 py-0.5 rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] font-mono truncate max-w-[220px]">
                                {displayTitle}
                              </span>
                            </div>
                            <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
                              Chunks are active by default. Review extracted facts before allowing Aura to use them.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() => setPreviewViewingSource(readySource)}
                            className="px-3.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-soft)] text-[13px] font-semibold text-[var(--text-primary)] transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                          >
                            <Eye className="w-3.5 h-3.5" /> View preview
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await handleConfirmAllFacts(readySource.id);
                              setDismissedPreviewIds(prev => new Set([...prev, readySource.id]));
                            }}
                            className="px-4 py-2 rounded-xl text-[13px] font-bold shadow-xs hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer flex items-center gap-1.5"
                            style={{
                              backgroundColor: 'var(--accent-solid)',
                              color: 'var(--accent-on-solid)'
                            }}
                          >
                            <Check className="w-3.5 h-3.5 stroke-[3]" /> Approve all facts
                          </button>
                          <button
                            type="button"
                            onClick={() => setDismissedPreviewIds(prev => new Set([...prev, readySource.id]))}
                            className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors cursor-pointer"
                            title="Dismiss notification"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ZONE 1: SOURCES */}
              <section className="space-y-4">
                <div className="pb-2 border-b border-[var(--border)] flex items-center justify-between">
                  <h2 className="text-[14px] font-semibold text-[var(--text-primary)] font-[Satoshi] tracking-tight">
                    Sources ({sources.length})
                  </h2>
                </div>

                {sources.length === 0 ? (
                  <div className="py-8 text-center border-b border-[var(--border)] font-[Instrument_Sans]">
                    <FolderOpen className="w-6 h-6 text-[var(--text-tertiary)] mx-auto mb-2 opacity-70" />
                    <h3 className="font-[Satoshi] text-[15px] font-semibold text-[var(--text-primary)]">
                      No sources added yet
                    </h3>
                    <p className="text-[14px] text-[var(--text-secondary)] max-w-md mx-auto mt-1 mb-4">
                      Add a link, upload a document, or paste text to teach Aura about your Space.
                    </p>
                    <button
                      onClick={() => openAddModal('link')}
                      className="px-4 py-2 rounded-xl text-[13px] font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs hover:opacity-90 transition-all"
                      style={{
                        backgroundColor: 'var(--accent-solid)',
                        color: 'var(--accent-on-solid)'
                      }}
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[3]" /> Add first source
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border)]">
                    {sources.map(source => {
                      const rawTitle = source.title || source.content_ref || '';
                      let displayTitle = rawTitle.includes('/') ? rawTitle.split('/').pop() || rawTitle : rawTitle;
                      displayTitle = displayTitle.replace(/^file_[a-f0-9]+_/i, '').replace(/^https?:\/\//, '').replace(/\/$/, '');

                      let displayRef = source.source_type === 'text' ? 'Saved text' : source.content_ref || '';
                      if (!displayRef.startsWith('http://') && !displayRef.startsWith('https://')) {
                        displayRef = displayRef.includes('/') ? displayRef.split('/').pop() || displayRef : displayRef;
                        displayRef = displayRef.replace(/^file_[a-f0-9]+_/i, '');
                      }

                      const isMenuOpen = openMenuId === source.id;
                      const style = getSourceTypeStyle(source.source_type);

                      return (
                        <div 
                          key={source.id} 
                          className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-[Instrument_Sans]"
                        >
                          {/* Source Info Left */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${style.bg} ${style.border} border overflow-hidden`}>
                              {source.source_type === 'url' && source.favicon_url ? (
                                <img
                                  src={source.favicon_url}
                                  alt=""
                                  referrerPolicy="no-referrer"
                                  className="w-4 h-4 object-contain rounded-xs"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    const next = e.currentTarget.nextElementSibling as HTMLElement;
                                    if (next) next.style.display = 'flex';
                                  }}
                                />
                              ) : null}
                              <span className="flex items-center justify-center" style={source.source_type === 'url' && source.favicon_url ? { display: 'none' } : undefined}>
                                {style.icon}
                              </span>
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2.5">
                                <h3 className="font-semibold text-[15px] text-[var(--text-primary)] truncate font-[Satoshi]">
                                  {displayTitle}
                                </h3>
                                {Boolean(source.assets?.images?.length || source.assets?.documents?.length || (source.assets as any)?.links?.length) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCompletedExtractionSource(source);
                                    }}
                                    className="shrink-0 text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-[var(--surface-soft)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] transition-colors cursor-pointer"
                                    title="Click to view extracted assets & context"
                                  >
                                    {[
                                      source.assets?.images?.length ? `${source.assets.images.length} img` : '',
                                      source.assets?.documents?.length ? `${source.assets.documents.length} doc` : '',
                                      (source.assets as any)?.links?.length ? `${(source.assets as any).links.length} links` : '',
                                    ].filter(Boolean).join(' · ')}
                                  </button>
                                )}

                                {source.status === 'ready' && (source.is_confirmed ?? true) ? (
                                  <span className="text-[12px] font-medium text-emerald-700 dark:text-emerald-400">
                                    Ready
                                  </span>
                                ) : ['uploaded', 'queued', 'running', 'processing', 'parsing_preview'].includes(source.status) ? (
                                  <button
                                    onClick={() => setProcessingSource(source)}
                                    className="text-[12px] font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5 hover:underline cursor-pointer border-none bg-transparent p-0 text-left"
                                  >
                                    <Clock className="w-3 h-3 animate-spin text-amber-600" />
                                    <span>
                                      {source.stage || 'Processing'} {source.progress != null ? `${source.progress}%` : ''}
                                      {source.eta_seconds != null && source.eta_seconds > 0
                                        ? ` · about ${source.eta_seconds < 60 ? `${source.eta_seconds}s` : `${Math.ceil(source.eta_seconds / 60)}m`} left`
                                        : ' · Review when ready'}
                                    </span>
                                  </button>
                                ) : source.status === 'ready_to_review' || source.is_confirmed === false ? (
                                  <button
                                    onClick={() => handleOpenReview(source)}
                                    className="text-[12px] font-medium text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                                  >
                                    Ready to review
                                  </button>
                                ) : source.status === 'failed' ? (
                                  <span className="flex items-center gap-1.5 text-[12px] font-medium text-rose-600">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    Failed
                                    <button
                                      type="button"
                                      onClick={() => void handleRetryFailedSource(source.id)}
                                      disabled={retryingSourceId === source.id}
                                      className="p-1 rounded-full border border-transparent hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors disabled:opacity-50 cursor-pointer"
                                      title="Retry extraction"
                                    >
                                      <RefreshCw className={`w-3.5 h-3.5 ${retryingSourceId === source.id ? 'animate-spin' : ''}`} />
                                    </button>
                                  </span>
                                ) : (
                                  <span className="text-[12px] font-medium text-[var(--text-secondary)]">{source.status}</span>
                                )}
                              </div>

                              <p className="text-[13px] text-[var(--text-secondary)] font-mono truncate">
                                {displayRef}
                              </p>
                              {spaceId && <PublicResourceToggle key={`${source.id}:${source.source_version}`} spaceId={spaceId} source={source} onSaved={() => void fetchSources()} />}
                            </div>
                          </div>

                          {/* Source Actions Right */}
                          <div className="flex items-center gap-2 shrink-0 sm:pt-0.5">
                            <button
                              onClick={() => handleOpenReview(source)}
                              className="px-3 py-1 rounded-md border border-transparent text-[13px] font-medium bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 transition-colors cursor-pointer"
                            >
                              Review
                            </button>

                            {/* Overflow Menu */}
                            <div className="relative">
                              <button
                                onClick={() => setOpenMenuId(isMenuOpen ? null : source.id)}
                                className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors cursor-pointer"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>

                              {isMenuOpen && (
                                <div className="absolute right-0 mt-1 w-48 bg-[var(--surface)] border border-[var(--border)] rounded-md shadow-lg py-1 z-20 font-[Instrument_Sans]">
                                  <button
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setVectorChunksSourceId(source.id);
                                      setIsVectorChunksOpen(true);
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-[13px] text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors flex items-center gap-2 cursor-pointer"
                                  >
                                    <Database className="w-3.5 h-3.5 text-sky-500" /> View vector chunks
                                  </button>
                                  <button
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setCompletedExtractionSource(source);
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-[13px] text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors flex items-center gap-2 cursor-pointer"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-[var(--text-secondary)]" /> View extracted details
                                  </button>
                                  <button
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      handleToggleConfirm(source.id, !(source.is_confirmed ?? true));
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-[13px] text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors cursor-pointer"
                                  >
                                    {source.is_confirmed ?? true ? 'Pause source' : 'Resume source'}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setDeleteConfirmSource(source);
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-[13px] text-rose-500 hover:bg-rose-500/10 transition-colors flex items-center gap-2 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" /> Remove
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* ZONE 2: AURA'S UNDERSTANDING */}
              <section className="pt-4 space-y-6">
                <div className="pb-3 border-b border-[var(--border)] flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-[18px] font-semibold text-[var(--text-primary)] font-[Satoshi] tracking-tight">
                      Aura’s understanding
                    </h2>
                    <p className="text-[13px] text-[var(--text-secondary)] mt-0.5 font-[Instrument_Sans]">
                      Knowledge synthesis and facts learned from your sources.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsPreviewModalOpen(true)}
                    className="w-9 h-9 rounded-xl bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 transition-colors flex items-center justify-center border border-transparent cursor-pointer shadow-xs shrink-0"
                    title="Full Knowledge Preview"
                    aria-label="Full Knowledge Preview"
                  >
                    <Eye className="w-4 h-4 text-[var(--accent-on-solid)]" />
                  </button>
                </div>

                {/* Space Summary Attributes */}
                <div className="flex flex-wrap items-center gap-2 font-[Instrument_Sans]">
                  <span className="px-3 py-1 rounded-lg bg-[var(--surface-soft)] border border-[var(--border)] text-[13px] font-semibold text-[var(--text-primary)]">
                    {primaryCategory}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-soft)] border border-[var(--border)] text-[13px] font-medium text-[var(--text-secondary)] inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="capitalize">{presenceLabel}</span>
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-soft)] border border-[var(--border)] text-[13px] font-medium text-[var(--text-secondary)]">
                    {offeringCount} {offeringCount === 1 ? 'offering' : 'offerings'}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-soft)] border border-[var(--border)] text-[13px] font-medium text-[var(--text-secondary)]">
                    {sources.length} {sources.length === 1 ? 'source' : 'sources'}
                  </span>
                </div>

                <div className="space-y-6 font-[Instrument_Sans]">
                  {identityData?.description && (
                    <div>
                      <h3 className="text-[16px] font-semibold">About this Space</h3>
                      <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-secondary)]">{identityData.description}</p>
                    </div>
                  )}

                  <section className="border-t border-[var(--border)] pt-5">
                    <h3 className="text-[16px] font-semibold">Facts · {visibleFacts.length}</h3>
                    <p className="mt-1 text-[13px] text-[var(--text-secondary)]">{confirmedFacts.length} confirmed. Open a source to review its details.</p>
                    {isLoadingFacts && sources.length > 0 ? (
                      <p className="mt-3 text-[14px] text-[var(--text-secondary)]">Loading facts…</p>
                    ) : factsFailed ? (
                      <button type="button" onClick={() => void refetchFacts()} className="mt-3 text-[var(--accent-ink)]">Could not load facts. Try again</button>
                    ) : visibleFacts.length === 0 ? (
                      <p className="mt-3 text-[14px] text-[var(--text-secondary)]">No saved facts yet. Ready sources can still be searched by Aura.</p>
                    ) : (
                      <div className="mt-3 divide-y divide-[var(--border)]">
                        {visibleFacts.slice(0, isFactsExpanded ? visibleFacts.length : 3).map(fact => {
                          const source = sourceForFact(fact);
                          return (
                            <div key={fact.id} className="py-3">
                              <p className="text-[14px] leading-relaxed">{fact.subject} — {fact.label}: {fact.value}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                                <span>{fact.verified ? 'Confirmed' : 'Needs review'}{source?.is_confirmed === false ? ' · Source paused' : ''}</span>
                                {source && <button type="button" onClick={() => handleOpenReview(source)} className="text-[var(--accent-ink)] underline">{source.title || 'View source'}{fact.source_page ? ` · Page ${fact.source_page}` : ''}</button>}
                              </div>
                            </div>
                          );
                        })}
                        {!isFactsExpanded && visibleFacts.length > 3 && (
                          <button type="button" onClick={() => setIsFactsExpanded(true)} className="w-full pt-3 text-left text-[13px] text-[var(--accent-ink)] hover:underline">
                            Show {visibleFacts.length - 3} more facts from your source reviews
                          </button>
                        )}
                        {isFactsExpanded && visibleFacts.length > 3 && (
                          <button type="button" onClick={() => setIsFactsExpanded(false)} className="w-full pt-3 text-left text-[13px] text-[var(--accent-ink)] hover:underline">
                            Show fewer facts
                          </button>
                        )}
                      </div>
                    )}
                  </section>

                  <section className="border-t border-[var(--border)] pt-5">
                    <h3 className="text-[16px] font-semibold">Structured details</h3>
                    <p className="mt-1 text-[13px] text-[var(--text-secondary)]">Details can come from your Space settings or be extracted from a source. Approved details may be used on your page and in Aura answers.</p>
                    {isLoadingEntities ? <p className="mt-3 text-[14px] text-[var(--text-secondary)]">Loading details…</p> : (
                      <div className="mt-3 divide-y divide-[var(--border)]">
                        {[
                          ['offering', 'Services and offerings'], ['location', 'Locations'],
                          ['portfolio_item', 'Portfolio'], ['contact_channel', 'Contact details'],
                          ['person', 'People'], ['event', 'Events'], ['action', 'Useful links'],
                        ].map(([type, label]) => {
                          const items = entities.filter(entity => entity.entity_type === type);
                          if (!items.length) return null;
                          const approved = items.filter(entity => entity.is_public && ['owner_confirmed', 'source_authoritative'].includes(entity.review_status)).length;
                          return (
                            <details key={type} className="py-3">
                              <summary className="cursor-pointer text-[14px] font-medium">{label} · {items.length} <span className="font-normal text-[var(--text-secondary)]">({approved} in use)</span></summary>
                              <div className="mt-2 flex flex-col gap-1.5 pl-2 border-l-2 border-[var(--border)]">
                                {items.map(entity => (
                                  <div key={entity.id} className="text-[13px] text-[var(--text-secondary)]">
                                    • {entity.payload_json.title || entity.payload_json.name || entity.payload_json.label || 'Untitled'}
                                    {entity.origin_type === 'owner' && <span className="ml-2 text-[11px] text-[var(--text-muted)]">Owner managed</span>}
                                  </div>
                                ))}
                              </div>
                              <p className="mt-3 text-[12px] text-[var(--text-secondary)]">
                                {sources.length === 0 && items.some(entity => entity.origin_type === 'extracted')
                                  ? 'These extracted details no longer have an originating source. Use the notification bell above to review them.'
                                  : items.some(entity => entity.origin_type === 'extracted')
                                    ? 'Use Review beside the originating source to inspect extracted details.'
                                    : 'These are owner-managed details from your Space settings.'}
                              </p>
                            </details>
                          );
                        })}
                        {entities.length === 0 && <p className="py-3 text-[14px] text-[var(--text-secondary)]">No structured details saved yet.</p>}
                      </div>
                    )}
                  </section>

                  <section className="border-t border-[var(--border)] pt-5">
                    <h3 className="text-[16px] font-semibold">Source coverage</h3>
                    <div className="mt-3 divide-y divide-[var(--border)]">
                      {sources.map(source => (
                        <div key={source.id} className="py-3">
                          <button type="button" onClick={() => handleOpenReview(source)} className="text-left text-[14px] font-medium text-[var(--accent-ink)] underline">{source.title || source.content_ref}</button>
                          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{source.page_count != null ? `${source.page_count} pages · ` : ''}{source.chunk_count != null ? `${source.chunk_count} searchable passages · ` : ''}{source.is_confirmed === false ? 'Paused' : source.status === 'ready' ? 'Ready' : source.status}</p>
                          {source.status === 'failed' || source.fact_extraction_status === 'failed' || source.entity_extraction_status === 'failed' ? (
                            <div className="mt-1 flex items-center gap-1.5 text-[12px] text-rose-600">
                              <span>Extraction failed.</span>
                              <button 
                                type="button" 
                                onClick={() => void handleRetryFailedSource(source.id)}
                                disabled={retryingSourceId === source.id}
                                className="p-1 rounded-full border border-transparent hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors disabled:opacity-50 flex items-center justify-center cursor-pointer"
                                title="Retry extraction"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${retryingSourceId === source.id ? 'animate-spin' : ''}`} />
                              </button>
                              <span className="text-[11px] opacity-70 truncate max-w-xs" title={source.error_msg || source.fact_extraction_error || source.entity_extraction_error || 'Please review or upload again.'}>
                                {source.error_msg || source.fact_extraction_error || source.entity_extraction_error || 'Please review or upload again.'}
                              </span>
                            </div>
                          ) : ['queued', 'running', 'processing', 'parsing_preview'].includes(source.status) ? (
                            <button 
                              type="button"
                              onClick={() => setProcessingSource(source)}
                              className="mt-1 flex items-center gap-1.5 text-[12px] text-amber-700 dark:text-amber-400 hover:opacity-80 transition-opacity cursor-pointer border-none bg-transparent p-0 text-left"
                            >
                              <Clock className="w-3 h-3 animate-spin text-amber-600" />
                              <span>
                                {source.stage || 'Processing'} {source.progress != null ? `${source.progress}% complete` : ''}
                                {source.eta_seconds != null && source.eta_seconds > 0
                                  ? ` · ETA ${source.eta_seconds < 60 ? `${source.eta_seconds}s` : `${Math.ceil(source.eta_seconds / 60)}m`}`
                                  : ''}
                              </span>
                            </button>
                          ) : (
                            source.fact_extraction_status === 'no_facts_found' && <p className="mt-1 text-[12px] text-[var(--text-secondary)]">No structured facts found; indexed text is still searchable.</p>
                          )}
                          {source.preview_excerpt && (
                            <button 
                              type="button" 
                              onClick={() => setExcerptSource(source)} 
                              className="mt-2 text-[13px] text-[var(--accent-ink)] hover:underline"
                            >
                              Read source excerpt
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </section>
            </div>
          )}
        </div>

      {/* Review Sheet Modal */}
      <SourceReviewSheet
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        spaceId={spaceId || ''}
        source={sources.find(source => source.id === selectedReviewSource?.id) || selectedReviewSource}
        onShowProgress={() => { setIsReviewOpen(false); setProcessingSource(selectedReviewSource); }}
        onToggleConfirm={handleToggleConfirm}
        onRemoveSource={handleRemoveSource}
        onRetrySource={handleRetrySource}
        onEntitiesChanged={async () => { await Promise.all([refetchEntities(), refetchFacts()]); }}
      />

      {/* Add Knowledge Modal */}
      <AddKnowledgeModal
        isOpen={isAddModalOpen}
        initialTab={addModalTab}
        onClose={() => setIsAddModalOpen(false)}
        onAddLink={handleAddLink}
        onUploadFile={handleUploadFile}
        onAddText={handleAddText}
        onSourceChanged={fetchSources}
        onProcessingStarted={(src) => setProcessingSource(src)}
      />

      {/* Link Preview Modal */}
      <LinkPreviewModal
        isOpen={Boolean(previewViewingSource)}
        onClose={() => setPreviewViewingSource(null)}
        source={previewViewingSource}
        onAddToSources={async (sourceId) => {
          await handleConfirmAllFacts(sourceId);
          setDismissedPreviewIds(prev => new Set([...prev, sourceId]));
        }}
      />

      {/* Styled Delete Confirmation Dialog */}
      <DeleteSourceConfirmDialog
        isOpen={!!deleteConfirmSource}
        sourceId={deleteConfirmSource?.id}
        sourceTitle={deleteConfirmSource?.title || deleteConfirmSource?.content_ref}
        sourceVersion={deleteConfirmSource?.source_version}
        isProcessing={Boolean(deleteConfirmSource && ['uploaded', 'queued', 'running', 'processing', 'parsing_preview'].includes(deleteConfirmSource.status))}
        isDeleting={isDeletingSource}
        onConfirm={async (mode, expectedSourceVersion) => {
          if (!deleteConfirmSource) return;
          setIsDeletingSource(true);
          try {
            await handleRemoveSource(deleteConfirmSource.id, mode, expectedSourceVersion);
            setDeleteConfirmSource(null);
          } finally {
            setIsDeletingSource(false);
          }
        }}
        onCancel={() => setDeleteConfirmSource(null)}
      />

      <KnowledgeCleanupReviewDialog
        isOpen={isCleanupReviewOpen}
        spaceId={spaceId || ''}
        alerts={cleanupAlerts}
        onClose={() => setIsCleanupReviewOpen(false)}
        onResolved={async () => {
          const result = await refetchCleanupAlerts();
          await Promise.all([refetchFacts(), refetchEntities()]);
          if (!result.data?.length) setIsCleanupReviewOpen(false);
        }}
      />

      {/* Processing Details Modal */}
      <ProcessingDetailsModal
        isOpen={!!processingSource}
        onClose={() => setProcessingSource(null)}
        source={sources.find(s => s.id === processingSource?.id) || processingSource}
        onConfirmAll={handleConfirmAllFacts}
      />

      {/* Source Excerpt Modal */}
      <SourceExcerptModal
        isOpen={!!excerptSource}
        onClose={() => setExcerptSource(null)}
        title={excerptSource?.title || excerptSource?.content_ref || 'Source'}
        sourceId={excerptSource?.id || ''}
      />

      {/* Full-Screen Knowledge Preview Modal */}
      <FullSpaceKnowledgePreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        spaceName={identityData?.display_name || 'Space Knowledge'}
        slug={identityData?.slug}
        purpose={identityData?.purpose}
        category={identityData?.category}
        presence={identityData?.presence}
        website={identityData?.website}
        description={identityData?.description}
        logoUrl={identityData?.logo_url}
        sources={sources.map(source => ({
          ...source,
          facts: (factGroups.find(group => group.sourceId === source.id)?.facts || [])
            .filter(fact => !['rejected', 'superseded'].includes(fact.review_status))
            .map(fact => ({ text: `${fact.subject} — ${fact.label}: ${fact.value}`, source_locator: fact.source_locator })),
        }))}
      />

      {/* Reupload Confirm Dialog */}
      <ReuploadConfirmDialog
        isOpen={!!reuploadSource}
        sourceTitle={reuploadSource?.title}
        onConfirm={async () => {
          if (!reuploadSource) return;
          const sourceId = reuploadSource.id;
          setReuploadSource(null);
          setIsReviewOpen(false);
          await handleRemoveSource(sourceId);
          openAddModal('upload');
        }}
        onCancel={() => setReuploadSource(null)}
      />

      {/* Extracted Knowledge & Linked Context Modal */}
      <ExtractionResultsModal
        isOpen={Boolean(completedExtractionSource)}
        onClose={() => setCompletedExtractionSource(null)}
        source={completedExtractionSource}
        spaceId={spaceId || ''}
        onOpenReviewSheet={() => {
          if (completedExtractionSource) {
            handleOpenReview(completedExtractionSource);
          }
        }}
      />

      {spaceId && (
        <VectorChunksManagerModal
          isOpen={isVectorChunksOpen}
          onClose={() => {
            setIsVectorChunksOpen(false);
            setVectorChunksSourceId(undefined);
          }}
          spaceId={spaceId}
          spaceName={identityData?.display_name || 'Space'}
          initialSourceId={vectorChunksSourceId}
        />
      )}
      </div>
    </div>
  );
};
