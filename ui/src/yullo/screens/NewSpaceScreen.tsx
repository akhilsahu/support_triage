import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { yulloOnboardingApi } from '../api/onboarding';
import { useAppStore } from '../../store/useAppStore';
import { 
  Pencil, Check, Sparkles, User as UserIcon, Briefcase, 
  Building, Globe, Link as LinkIcon, Upload, FileText, X, ChevronRight, Info, Eye
} from 'lucide-react';

import { useYulloAppStore } from '../store/useYulloAppStore';
import { YulloAppHeader } from '../components/YulloAppHeader';
import { SourceUnderstandingCard } from '../components/SourceUnderstandingCard';
import { ProcessingLoaderSystem } from '../components/ProcessingLoaderSystem';
import { FullSpaceKnowledgePreviewModal } from '../components/FullSpaceKnowledgePreviewModal';

const PURPOSES = [
  { id: 'person', title: 'Myself', shortTitle: 'Myself', desc: 'A personal space for your thoughts & AI.', icon: UserIcon },
  { id: 'creator', title: 'My work / Creator', shortTitle: 'Creator', desc: 'Portfolio, resume, and professional work.', icon: Briefcase },
  { id: 'business', title: 'A business or brand', shortTitle: 'Business', desc: 'Engage customers & provide support.', icon: Building },
  { id: 'organization', title: 'A community or organization', shortTitle: 'Community', desc: 'A hub for your group or club.', icon: Globe },
] as const;

export interface AboutState {
  value: string;
  source: 'aura' | 'owner';
  generatedFromVersion?: number;
  auraSuggestion?: string;
}

function ProcessingLoaderModal({ 
  state 
}: { 
  state: { active: boolean; title: string; subtitle: string; estimatedSeconds: number } 
}) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!state.active) {
      setElapsedMs(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsedMs(prev => prev + 100);
    }, 100);
    return () => clearInterval(interval);
  }, [state.active]);

  if (!state.active) return null;

  const totalMs = state.estimatedSeconds * 1000;
  const progressPercent = Math.min(95, Math.round((elapsedMs / totalMs) * 100));
  const remainingSeconds = Math.max(0, Math.ceil((totalMs - elapsedMs) / 1000));

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-[var(--surface-elevated)] border border-[var(--border-strong)] rounded-2xl p-7 shadow-2xl flex flex-col items-center text-center overflow-hidden">
        
        {/* Glow backdrop pulse */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-[var(--accent-solid)] opacity-20 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-[var(--accent-solid)] opacity-15 blur-3xl rounded-full pointer-events-none" />

        {/* Animated Ring Loader */}
        <div className="relative w-16 h-16 mb-5 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-4 border-[var(--border)] opacity-30" />
          <div className="absolute inset-0 rounded-full border-4 border-[var(--accent)] border-t-transparent animate-spin" />
          <Sparkles className="w-7 h-7 text-[var(--accent-ink)] animate-pulse" />
        </div>

        {/* Title & Subtitle */}
        <h3 className="text-xl font-semibold tracking-tight text-[var(--text-primary)] mb-1.5 font-[Satoshi]">
          {state.title}
        </h3>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-xs leading-relaxed">
          {state.subtitle}
        </p>

        {/* Smooth Progress Bar */}
        <div className="w-full bg-[var(--surface-soft)] h-2.5 rounded-full overflow-hidden mb-3.5 border border-[var(--border)]">
          <div 
            className="h-full bg-gradient-to-r from-[var(--accent)] to-purple-500 transition-all duration-150 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* ETA Counter Badge */}
        <div className="flex items-center justify-between w-full text-xs font-mono text-[var(--text-muted)] px-1">
          <span>{progressPercent}% Complete</span>
          <span>
            {remainingSeconds > 0 ? `Est. ~${remainingSeconds}s remaining` : 'Finishing up...'}
          </span>
        </div>
      </div>
    </div>
  );
}

export function NewSpaceScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { token: appToken } = useAppStore();
  const { user, csrfToken } = useYulloAppStore();
  const activeToken = appToken || csrfToken || '';

  const [purpose, setPurpose] = useState<'person' | 'creator' | 'business' | 'organization'>('business');
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');

  // Editable Header Mode States
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingHandle, setIsEditingHandle] = useState(false);
  const [handleStatus, setHandleStatus] = useState<{ valid: boolean; reason?: string } | null>({ valid: true });

  // About & Category Provenance State
  const [aboutState, setAboutState] = useState<AboutState>({
    value: '',
    source: 'owner',
  });

  const [categoryState, setCategoryState] = useState<{
    value: string;
    source: 'aura' | 'owner';
    auraSuggestion?: string;
  }>({
    value: '',
    source: 'owner',
  });

  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [clarification, setClarification] = useState<string | null>(null);

  const [draftId, setDraftId] = useState<string | null>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  // Modals for Knowledge Starters
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showTextModal, setShowTextModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const [inputUrl, setInputUrl] = useState('');
  const [inputText, setInputText] = useState('');
  const [addingSource, setAddingSource] = useState(false);

  // Payoff Launch Sequence State
  const [payoffState, setPayoffState] = useState<'idle' | 'creating' | 'live' | 'opening'>('idle');

  const titleInputRef = useRef<HTMLInputElement>(null);

  // Focus title input when inline edit mode opens
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Explicit Generation Confirmation State (no automatic background requests)
  const [showGeneratePrompt, setShowGeneratePrompt] = useState(false);
  const [isGeneratingAbout, setIsGeneratingAbout] = useState(false);

  // Processing Loader Overlay State with ETA Countdown
  const [processingState, setProcessingState] = useState<{
    active: boolean;
    title: string;
    subtitle: string;
    estimatedSeconds: number;
  }>({
    active: false,
    title: '',
    subtitle: '',
    estimatedSeconds: 5,
  });

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nameVal = e.target.value;
    setDisplayName(nameVal);
    setShowGeneratePrompt(true);

    if (!isEditingHandle) {
      const generatedSlug = nameVal
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 40) || 'space';
      setHandle(generatedSlug);
    }
  };

  const handlePurposeChange = (newPurpose: 'person' | 'creator' | 'business' | 'organization') => {
    setPurpose(newPurpose);
    setShowGeneratePrompt(true);
  };

  const handleGenerateAbout = async () => {
    setIsGeneratingAbout(true);
    setProcessingState({
      active: true,
      title: 'Synthesizing Grounded Identity & Category',
      subtitle: 'Analyzing your sources to extract verified brand claims...',
      estimatedSeconds: 5,
    });
    try {
      // Prevent stale-purpose bug: Save current display name and purpose, await draft update
      if (draftId) {
        await yulloOnboardingApi.updateDraft({
          name: displayName.trim() || undefined,
          purpose: purpose,
          description: aboutState.source === 'owner' && aboutState.value.trim() ? aboutState.value.trim() : undefined,
          category: categoryState.source === 'owner' && categoryState.value.trim() ? categoryState.value.trim() : undefined,
        }, activeToken);
      }

      // Call identity generation endpoint with persisted values
      const res = await yulloOnboardingApi.generateSummary(
        { spaceId: draftId || undefined, name: displayName }, 
        activeToken
      );

      if (res.status === 'ready') {
        setClarification(null);
        if (res.description) {
          if (aboutState.source !== 'owner' || !aboutState.value.trim()) {
            setAboutState({
              value: res.description,
              source: 'aura',
              generatedFromVersion: res.context_version
            });
          } else {
            setAboutState(prev => ({ ...prev, auraSuggestion: res.description }));
          }
        }
        if (res.category) {
          if (categoryState.source !== 'owner' || !categoryState.value.trim()) {
            setCategoryState({
              value: res.category,
              source: 'aura',
            });
          } else {
            setCategoryState(prev => ({ ...prev, auraSuggestion: res.category }));
          }
        }
      } else if (res.status === 'needs_clarification') {
        setClarification(res.clarification || 'Please clarify space purpose.');
      } else if (res.status === 'insufficient_context') {
        setClarification(res.clarification || 'Insufficient context available to generate identity.');
      }
    } catch (err) {
      console.warn('Failed to generate summary:', err);
    } finally {
      setIsGeneratingAbout(false);
      setShowGeneratePrompt(false);
      setProcessingState(prev => ({ ...prev, active: false }));
    }
  };

  // Validate handle whenever handle updates
  useEffect(() => {
    if (!handle) return;
    const timer = setTimeout(async () => {
      try {
        const res = await yulloOnboardingApi.validateHandle(handle, activeToken);
        setHandleStatus({ valid: res.valid, reason: res.reason });
      } catch (err) {
        setHandleStatus({ valid: false, reason: 'Check failed' });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [handle, activeToken]);

  // Always initialize a 100% clean fresh draft on page load
  useEffect(() => {
    const initDraft = async () => {
      try {
        const freshDraft = await yulloOnboardingApi.resetDraft(activeToken);
        setDraftId(freshDraft.id);
        setDisplayName('');
        setHandle(freshDraft.handle || '');
        setPurpose('business');
        setSources([]);
        setAboutState({ value: '', source: 'owner' });
        setCategoryState({ value: '', source: 'owner' });
        setClarification(null);
      } catch (err) {
        // Fallback: silent draft creation on demand
      }
    };
    initDraft();
  }, [activeToken]);

  // Auto-save draft on every edit with 400ms debounce
  useEffect(() => {
    if (!draftId) return;
    const timer = setTimeout(async () => {
      try {
        await yulloOnboardingApi.updateDraft({
          name: displayName.trim() || undefined,
          purpose: purpose,
          description: aboutState.value.trim() || undefined,
          description_source: aboutState.source
        }, activeToken);
      } catch (err) {
        console.warn('Auto-save draft failed:', err);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [displayName, purpose, aboutState, draftId, activeToken]);

  const handleAddLink = async () => {
    if (!inputUrl.trim()) return;
    const urlToAdd = inputUrl.trim();
    setInputUrl('');
    setShowLinkModal(false);
    setAddingSource(true);
    setProcessingState({
      active: true,
      title: 'Analyzing Link & Scraping Content',
      subtitle: `Fetching ${urlToAdd} and verifying grounded facts...`,
      estimatedSeconds: 6,
    });
    try {
      let activeDraftId = draftId;
      if (!activeDraftId) {
        const d = await yulloOnboardingApi.createDraft(purpose, activeToken);
        activeDraftId = d.id;
        setDraftId(d.id);
      }
      const accepted = await yulloOnboardingApi.addSourceUrl(urlToAdd, 'url', activeDraftId || undefined, activeToken);
      
      // If title was default 'My Space', auto-update title from scraped link title
      if (accepted.title && (displayName === 'My Space' || !displayName.trim())) {
        const scrapedTitle = accepted.title.trim();
        setDisplayName(scrapedTitle);
        if (!isEditingHandle) {
          const generatedSlug = scrapedTitle
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 40) || 'space';
          setHandle(generatedSlug);
        }
        await yulloOnboardingApi.updateDraft({ name: scrapedTitle }, activeToken);
      }

      setSources(prev => [...prev, {
        id: accepted.id || accepted.item_id || accepted.source_id,
        source_type: 'url',
        content_ref: urlToAdd,
        status: accepted.status || 'ready',
        title: accepted.title,
        facts: accepted.facts,
        target_badges: accepted.target_badges,
        raw_text: accepted.raw_text,
        is_confirmed: accepted.is_confirmed || false
      }]);
      setShowGeneratePrompt(true);
    } catch (err: any) {
      alert(`Error adding URL: ${err.message}`);
    } finally {
      setAddingSource(false);
      setProcessingState(prev => ({ ...prev, active: false }));
    }
  };

  const handleAddText = async () => {
    if (!inputText.trim()) return;
    const textToAdd = inputText.trim();
    setInputText('');
    setShowTextModal(false);
    setAddingSource(true);
    setProcessingState({
      active: true,
      title: 'Processing Text Note',
      subtitle: 'Extracting key facts and domain background...',
      estimatedSeconds: 4,
    });
    try {
      let activeDraftId = draftId;
      if (!activeDraftId) {
        const d = await yulloOnboardingApi.createDraft(purpose, activeToken);
        activeDraftId = d.id;
        setDraftId(d.id);
      }
      const accepted = await yulloOnboardingApi.addSourceText(textToAdd, activeDraftId || undefined, activeToken);
      setSources(prev => [...prev, {
        id: accepted.id || accepted.item_id || accepted.source_id,
        source_type: 'text',
        content_ref: textToAdd.substring(0, 40) + '...',
        status: accepted.status || 'ready',
        title: 'Pasted text note',
        facts: [
          'User pasted notes and custom context',
          'Domain rules and background information'
        ],
        target_badges: ['About', 'Aura knowledge'],
        raw_text: textToAdd,
        is_confirmed: false
      }]);
      setShowGeneratePrompt(true);
    } catch (err: any) {
      alert(`Error adding text: ${err.message}`);
    } finally {
      setAddingSource(false);
      setProcessingState(prev => ({ ...prev, active: false }));
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setShowUploadModal(false);
    setAddingSource(true);
    setProcessingState({
      active: true,
      title: 'Ingestion in progress with Aura...',
      subtitle: `Uploading ${file.name}, parsing, chunking and extracting facts...`,
      estimatedSeconds: 5,
    });
    try {
      let activeDraftId = draftId;
      if (!activeDraftId) {
        const d = await yulloOnboardingApi.createDraft(purpose, activeToken);
        activeDraftId = d.id;
        setDraftId(d.id);
      }
      const newSource = await yulloOnboardingApi.addSourceFile(file, activeDraftId || undefined, activeToken);
      setSources(prev => [...prev, newSource]);
      setShowGeneratePrompt(true);
    } catch (err: any) {
      alert(`Error uploading file: ${err.message}`);
    } finally {
      setAddingSource(false);
      setProcessingState(prev => ({ ...prev, active: false }));
    }
  };

  const handleDeleteSource = async (id: string) => {
    try {
      await yulloOnboardingApi.deleteSource(id, activeToken);
      setSources(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  // Launch Handler with ~500ms Payoff Sequence
  const handleCreateSpace = async () => {
    const nameToUse = displayName.trim() || 'Unnamed Space';
    
    setProcessingState({
      active: true,
      title: 'Building & Publishing Space',
      subtitle: 'Reserving handle, binding knowledge base, and deploying space...',
      estimatedSeconds: 5,
    });

    try {
      await yulloOnboardingApi.updateDraft({ name: nameToUse }, activeToken);
      await yulloOnboardingApi.reserveHandle(handle, activeToken);

      // Auto-populate Category silently if user hasn't set one manually
      if (!categoryState.value.trim()) {
        try {
          const res = await yulloOnboardingApi.generateSummary(
            { spaceId: draftId || undefined, name: nameToUse }, 
            activeToken
          );
          if (res.status === 'ready' && res.category) {
            setCategoryState({ value: res.category, source: 'aura' });
            await yulloOnboardingApi.updateDraft({ category: res.category, category_source: 'aura' }, activeToken);
          }
        } catch (silentGenErr) {
          console.warn('Silent auto-category generation skipped:', silentGenErr);
        }
      }

      setPayoffState('creating');
      const res = await yulloOnboardingApi.launch(activeToken);
      queryClient.invalidateQueries({ queryKey: ['home'] });

      const targetSpaceId = res.space_id || draftId;

      setTimeout(() => {
        setPayoffState('live');
        setTimeout(() => {
          setPayoffState('opening');
          setTimeout(() => {
            navigate(`/yullo/spaces/${targetSpaceId}`, { replace: true });
          }, 400);
        }, 500);
      }, 450);

    } catch (err: any) {
      setPayoffState('idle');
      alert(`Failed to create space: ${err.message}`);
    } finally {
      setProcessingState(prev => ({ ...prev, active: false }));
    }
  };

  const isValid = displayName.trim().length > 0 && handleStatus?.valid !== false;

  return (
    <div className="yullo-app min-h-screen bg-[var(--canvas)] text-[var(--text-primary)] font-[Instrument_Sans] flex flex-col justify-between">
      <div>
        {/* Yullo App Header with Theme & Accent Switcher */}
        <YulloAppHeader />

        {/* Shared Layout Container max-width: 1180px */}
        <div className="max-w-[1180px] w-full mx-auto px-6 md:px-10 pt-10 pb-36">
          
          {/* Top Scaled Editable Space Header */}
          <div className="pb-8 mb-10 border-b border-[var(--border)] flex flex-col md:flex-row md:items-center justify-between gap-6">
            
            {/* Left: Editable Space Name */}
            <div className="flex-1 flex flex-col justify-center">
              {isEditingTitle ? (
                <div className="flex items-center gap-3">
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={displayName}
                    onChange={handleNameChange}
                    onBlur={() => setIsEditingTitle(false)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingTitle(false); }}
                    className="text-[clamp(32px,4vw,52px)] leading-[1.05] font-[Satoshi] font-semibold tracking-tight bg-transparent text-[var(--text-primary)] border-b-2 border-[var(--accent)] px-0 py-1 outline-none w-full"
                    placeholder="Enter space name..."
                  />
                  <Check className="w-6 h-6 text-emerald-500 shrink-0 cursor-pointer" onClick={() => setIsEditingTitle(false)} />
                </div>
              ) : (
                <div
                  onClick={() => setIsEditingTitle(true)}
                  className="group flex items-center gap-3.5 cursor-pointer py-1 px-2 -ml-2 rounded-xl hover:bg-[var(--surface-soft)] transition-colors border border-transparent w-fit"
                  title="Click to edit space name"
                >
                  <h1 className="text-[clamp(32px,4vw,52px)] leading-[1.05] font-[Satoshi] font-semibold tracking-tight text-[var(--text-primary)]">
                    {displayName || 'Unnamed Space'}
                  </h1>
                  <Pencil className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--accent-ink)] opacity-60 transition-opacity" />
                </div>
              )}
            </div>

            {/* Right: Editable Yullo Link & Availability Status */}
            <div className="flex flex-col items-start md:items-end justify-center gap-1.5 shrink-0">
              {isEditingHandle ? (
                <div className="flex items-center min-h-[46px] bg-[var(--surface-soft)] border border-[var(--accent)] rounded-[12px] px-4 transition-colors">
                  <span className="text-[15px] font-mono text-[var(--text-muted)] select-none pr-1">
                    yullo.co/
                  </span>
                  <input
                    type="text"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    onBlur={() => setIsEditingHandle(false)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingHandle(false); }}
                    className="w-40 md:w-48 bg-transparent text-[15px] font-mono text-[var(--text-primary)] outline-none"
                    placeholder="yourname"
                    autoFocus
                  />
                  <Check className="w-4 h-4 text-emerald-500 shrink-0 ml-1 cursor-pointer" onClick={() => setIsEditingHandle(false)} />
                </div>
              ) : (
                <div 
                  onClick={() => setIsEditingHandle(true)}
                  className="group flex items-center gap-2.5 min-h-[46px] px-4 rounded-[12px] bg-[var(--surface-soft)] border border-[var(--border)] hover:border-[var(--accent)] cursor-pointer transition-colors"
                  title="Click to edit Yullo link"
                >
                  <span className="text-[15px] font-mono text-[var(--text-primary)]">
                    yullo.co/{handle}
                  </span>
                  <Pencil className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent-ink)] opacity-60 transition-opacity" />
                </div>
              )}

              {/* Availability Status */}
              <div className="text-[13px] font-medium flex items-center gap-1 h-5">
                {handleStatus?.valid ? (
                  <span className="text-emerald-500 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Available
                  </span>
                ) : (
                  <span className="text-red-400">
                    {handleStatus?.reason || 'Unavailable'}
                  </span>
                )}
              </div>
            </div>

          </div>

          {/* 2-Column Grid with clamp(28px, 4vw, 52px) gap */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[clamp(28px,4vw,52px)] items-start">
            
            {/* Left Column: 01 Identity */}
            <section className="space-y-7">
              <div className="border-b border-[var(--border)] h-[44px] flex items-center justify-between">
                <h2 className="text-[18px] font-semibold text-[var(--text-primary)] flex items-center">
                  <span className="text-[14px] font-normal text-[var(--text-muted)] font-mono mr-3">01</span>
                  Identity
                </h2>
              </div>

              {/* Purpose Selector - 4-column equal grid guaranteed to sit in 1 single row */}
              <div>
                <label className="block text-[15px] font-medium text-[var(--text-primary)] mb-3.5">
                  What are you creating?
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {PURPOSES.map((p) => {
                    const Icon = p.icon;
                    const isSelected = purpose === p.id;
                    return (
                      <div key={p.id} className="relative group/tooltip w-full">
                        <button
                          type="button"
                          onClick={() => handlePurposeChange(p.id as any)}
                          className={`w-full min-h-[46px] px-2 py-2 rounded-xl border text-[13px] font-medium transition-all flex items-center justify-center gap-1.5 ${
                            isSelected 
                              ? 'border-[var(--accent)] bg-[var(--surface-soft)] text-[var(--text-primary)] shadow-sm font-semibold' 
                              : 'border-[var(--border)] hover:border-[var(--text-secondary)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-[var(--accent-ink)]' : 'text-[var(--text-muted)]'}`} />
                          <span className="truncate text-center">{p.shortTitle}</span>
                        </button>

                        {/* Hover Info Box Tooltip */}
                        <div className="absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+8px)] hidden group-hover/tooltip:flex flex-col items-center z-30 pointer-events-none w-56">
                          <div className="bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] text-[12px] font-[Instrument_Sans] px-3.5 py-2 rounded-xl shadow-xl text-center leading-snug">
                            <span className="font-semibold block mb-0.5">{p.title}</span>
                            {p.desc}
                          </div>
                          <div className="w-2.5 h-2.5 bg-[var(--surface)] border-b border-r border-[var(--border)] rotate-45 -mt-1" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Clarification Banner for needs_clarification / insufficient_context */}
              {clarification && (
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-xl text-[13px] flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{clarification}</span>
                </div>
              )}

              {/* Compact Onboarding Category Line */}
              {categoryState.value ? (
                <div className="p-3.5 bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[12px] font-medium text-[var(--text-muted)] block">Suggested category</span>
                    <span className="text-[14px] font-semibold text-[var(--text-primary)]">{categoryState.value}</span>
                  </div>
                  {isEditingCategory ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={categoryState.value}
                        onChange={(e) => setCategoryState({ value: e.target.value, source: 'owner' })}
                        onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingCategory(false); }}
                        className="text-[13px] bg-[var(--surface)] border border-[var(--accent)] px-2.5 py-1 rounded-lg text-[var(--text-primary)] outline-none"
                        autoFocus
                      />
                      <button type="button" onClick={() => setIsEditingCategory(false)} className="text-[12px] text-emerald-500 font-medium cursor-pointer">Done</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsEditingCategory(true)}
                      className="text-[13px] font-medium text-[var(--accent-ink)] hover:underline cursor-pointer shrink-0"
                    >
                      Change
                    </button>
                  )}
                </div>
              ) : null}

              {/* Category Suggestion Override Banner if user already edited */}
              {categoryState.source === 'owner' && categoryState.auraSuggestion && (
                <div className="p-3 bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl flex items-center justify-between text-[13px]">
                  <span className="text-[var(--text-primary)]">
                    Aura suggested category: <strong>{categoryState.auraSuggestion}</strong>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCategoryState(prev => ({ ...prev, auraSuggestion: undefined }))}
                      className="text-[12px] font-medium text-[var(--text-muted)] cursor-pointer"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryState({
                          value: categoryState.auraSuggestion || categoryState.value,
                          source: 'aura',
                          auraSuggestion: undefined
                        });
                      }}
                      className="px-2.5 py-1 bg-[var(--accent-solid)] text-[var(--accent-on-solid)] rounded-lg font-medium text-[12px] cursor-pointer"
                    >
                      Use suggestion
                    </button>
                  </div>
                </div>
              )}

              {/* About Textarea & Aura Provenance */}
              <div>
                {/* Explicit Generation Confirmation Card (On top of About box) */}
                {showGeneratePrompt && (
                  <div className="mb-3.5 p-3.5 bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl flex items-center justify-between gap-3">
                    <span className="text-[13px] font-medium text-[var(--text-primary)] flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[var(--accent-ink)] shrink-0" />
                      Generate an About description based on your info?
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowGeneratePrompt(false)}
                        className="text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2 py-1 cursor-pointer transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleGenerateAbout}
                        disabled={isGeneratingAbout}
                        className="px-3 py-1.5 bg-[var(--accent-solid)] text-[var(--accent-on-solid)] text-[12px] font-medium rounded-lg hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
                      >
                        {isGeneratingAbout ? 'Generating...' : 'Yes, generate'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between mb-2.5">
                  <label className="text-[15px] font-medium text-[var(--text-primary)]">
                    About
                  </label>
                  <span className="text-[13px] text-[var(--text-muted)] font-normal">Optional</span>
                </div>

                <textarea
                  value={aboutState.value}
                  onChange={(e) => {
                    const newVal = e.target.value;
                    setAboutState(prev => ({
                      ...prev,
                      value: newVal,
                      source: 'owner'
                    }));
                  }}
                  rows={5}
                  placeholder="A short description of what this space is about..."
                  className="w-full min-h-[150px] p-4 md:p-5 rounded-[14px] bg-[var(--surface)] border border-[var(--border)] text-[16px] text-[var(--text-primary)] leading-relaxed outline-none focus:border-[var(--accent)] transition-colors"
                />

                {/* Provenance Helper */}
                <div className="mt-2.5 text-[14px] text-[var(--text-muted)] font-normal flex flex-col gap-2">
                  {aboutState.source === 'aura' && (
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[var(--accent-ink)] shrink-0" />
                      <span>Generated by Aura from your space info.</span>
                    </div>
                  )}

                  {aboutState.source === 'owner' && !aboutState.auraSuggestion && (
                    <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                      <span>• Edited by you</span>
                    </div>
                  )}

                  {aboutState.source === 'owner' && aboutState.auraSuggestion && (
                    <div className="flex items-center justify-between bg-[var(--surface-soft)] border border-[var(--border)] p-3 rounded-[12px] text-[13px]">
                      <span className="text-[var(--text-primary)]">
                        Aura generated an updated suggestion for your space.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setAboutState(prev => ({
                            ...prev,
                            value: prev.auraSuggestion || prev.value,
                            source: 'aura',
                            auraSuggestion: undefined
                          }));
                        }}
                        className="px-3 py-1.5 bg-[var(--accent-solid)] text-[var(--accent-on-solid)] rounded-lg font-medium text-[12px] hover:opacity-90 transition-opacity shrink-0 ml-3 cursor-pointer"
                      >
                        Use suggestion
                      </button>
                    </div>
                  )}
                </div>
              </div>

            </section>

            {/* Right Column: 02 Give Aura a head start */}
            <section className="space-y-7">
              <div className="border-b border-[var(--border)] h-[44px] flex items-center justify-between">
                <h2 className="text-[18px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <span className="text-[14px] font-normal text-[var(--text-muted)] font-mono mr-1">02</span>
                  Give Aura a head start
                  <div className="relative group/headstart inline-flex items-center">
                    <Info className="w-4 h-4 text-[var(--text-muted)] hover:text-[var(--accent-ink)] cursor-pointer transition-colors" />
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+8px)] hidden group-hover/headstart:flex flex-col items-center z-30 pointer-events-none w-64">
                      <div className="bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] text-[12px] font-[Instrument_Sans] px-3.5 py-2 rounded-xl shadow-xl text-center leading-snug font-normal">
                        Upload documents, website links, or text notes to train Aura on verified facts for your space.
                      </div>
                      <div className="w-2.5 h-2.5 bg-[var(--surface)] border-b border-r border-[var(--border)] rotate-45 -mt-1" />
                    </div>
                  </div>
                </h2>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsPreviewModalOpen(true)}
                    className="w-8 h-8 rounded-lg bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 transition-colors flex items-center justify-center border border-transparent cursor-pointer shadow-xs"
                    title="Full Knowledge Preview"
                    aria-label="Full Knowledge Preview"
                  >
                    <Eye className="w-4 h-4 text-[var(--accent-on-solid)]" />
                  </button>
                  <span className="text-[13px] text-[var(--text-muted)] font-normal">Optional</span>
                </div>
              </div>

              {/* Minimizable / Modal ETA Processing System */}
              <ProcessingLoaderSystem state={processingState} />

              {/* Knowledge Sub-header matching left column */}
              <div>
                <p className="block text-[15px] font-medium text-[var(--text-primary)] mb-3.5">
                  Add anything Aura can learn from.
                </p>

                {/* Action Tiles Grid with Always-Visible One-Line Subtitles */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setShowLinkModal(true)}
                    className="min-h-[76px] p-3.5 rounded-[14px] bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 transition-colors border border-transparent flex flex-col items-center justify-center text-center cursor-pointer"
                  >
                    <div className="flex items-center gap-2 font-medium text-[14px]">
                      <LinkIcon className="w-4 h-4 text-[var(--accent-on-solid)] shrink-0" />
                      <span>Add a link</span>
                    </div>
                    <span className="text-[11px] text-[var(--accent-on-solid)] opacity-70 font-normal block mt-1">
                      Websites, articles, or social links
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowUploadModal(true)}
                    className="min-h-[76px] p-3.5 rounded-[14px] bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 transition-colors border border-transparent flex flex-col items-center justify-center text-center cursor-pointer"
                  >
                    <div className="flex items-center gap-2 font-medium text-[14px]">
                      <Upload className="w-4 h-4 text-[var(--accent-on-solid)] shrink-0" />
                      <span>Upload</span>
                    </div>
                    <span className="text-[11px] text-[var(--accent-on-solid)] opacity-70 font-normal block mt-1">
                      PDFs, docs, or text files
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowTextModal(true)}
                    className="min-h-[76px] p-3.5 rounded-[14px] bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 transition-colors border border-transparent flex flex-col items-center justify-center text-center cursor-pointer"
                  >
                    <div className="flex items-center gap-2 font-medium text-[14px]">
                      <FileText className="w-4 h-4 text-[var(--accent-on-solid)] shrink-0" />
                      <span>Paste text</span>
                    </div>
                    <span className="text-[11px] text-[var(--accent-on-solid)] opacity-70 font-normal block mt-1">
                      Raw notes, FAQs, or bio content
                    </span>
                  </button>
                </div>
              </div>

              {/* Sources List or Intentional Empty State */}
              {sources.length > 0 ? (
                <div className="space-y-3 mt-4">
                  {sources.map((s) => (
                    <SourceUnderstandingCard
                      key={s.id}
                      source={s}
                      onUseSource={(id) => {
                        setSources(prev => prev.map(item => item.id === id ? { ...item, is_confirmed: true } : item));
                        setShowGeneratePrompt(true);
                      }}
                      onRemove={(id) => handleDeleteSource(id)}
                      onFactsChange={(id, newFacts) => {
                        setSources(prev => prev.map(item => item.id === id ? { ...item, facts: newFacts } : item));
                      }}
                      onToggleConfirm={async (id, nextState) => {
                        setSources(prev => prev.map(item => item.id === id ? { ...item, is_confirmed: nextState } : item));
                        try {
                          await yulloOnboardingApi.updateSource(id, { is_confirmed: nextState }, activeToken);
                        } catch (e) {
                          console.warn('Failed to update source confirmed state:', e);
                        }
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="p-6 rounded-[14px] bg-[var(--surface-soft)]/40 border border-transparent text-center text-[14px] text-[var(--text-muted)] leading-relaxed">
                  <p className="font-medium text-[var(--text-secondary)]">Nothing added yet.</p>
                  <p className="text-[13px] mt-1">You can create the Space now and teach Aura later.</p>
                </div>
              )}
            </section>

          </div>

        </div>
      </div>

      {/* Sticky Bottom Action Footer */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--surface)]/95 backdrop-blur border-t border-[var(--border)] py-4 shadow-2xl">
        <div className="max-w-[1180px] w-full mx-auto px-6 md:px-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[15px] text-[var(--text-secondary)]">
            {isValid ? (
              <span>Ready to create <strong>{displayName || 'Unnamed Space'}</strong></span>
            ) : (
              <span className="text-[var(--text-muted)]">Enter a space name to continue.</span>
            )}
          </div>

          <div className="flex items-center gap-4 w-full sm:w-auto justify-end">
            <button
              onClick={() => navigate('/yullo/home')}
              className="px-5 py-3 rounded-[14px] text-[15px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Cancel
            </button>

            <button
              onClick={handleCreateSpace}
              disabled={!isValid || payoffState !== 'idle'}
              className="h-[52px] px-7 rounded-[14px] text-[16px] font-medium bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 transition-opacity disabled:opacity-50 shadow-md flex items-center gap-2.5"
            >
              <span>Create Space</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Add Link Modal with Onboarding Link Suggestions */}
      {showLinkModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4">
            <h3 className="text-[18px] font-[Satoshi] font-semibold text-[var(--text-primary)]">Add a link</h3>
            <input
              type="url"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl p-3.5 text-[15px] text-[var(--text-primary)] outline-none"
            />

            {/* Quick Link Suggestions Row matching Onboarding */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[12px] text-[var(--text-muted)] font-medium mr-1 select-none">Suggestions:</span>
              <button
                type="button"
                onClick={() => setInputUrl('https://example.com')}
                className="px-2.5 py-1 rounded-lg bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 text-[12px] font-medium transition-colors border border-transparent cursor-pointer"
              >
                Website
              </button>
              <button
                type="button"
                onClick={() => setInputUrl('https://youtube.com/@username')}
                className="px-2.5 py-1 rounded-lg bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 text-[12px] font-medium transition-colors border border-transparent cursor-pointer"
              >
                YouTube
              </button>
              <button
                type="button"
                onClick={() => setInputUrl('https://linkedin.com/in/username')}
                className="px-2.5 py-1 rounded-lg bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 text-[12px] font-medium transition-colors border border-transparent cursor-pointer"
              >
                LinkedIn
              </button>
              <button
                type="button"
                onClick={() => setInputUrl('https://instagram.com/username')}
                className="px-2.5 py-1 rounded-lg bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 text-[12px] font-medium transition-colors border border-transparent cursor-pointer"
              >
                Instagram
              </button>
              <button
                type="button"
                onClick={() => setInputUrl('https://x.com/username')}
                className="px-2.5 py-1 rounded-lg bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 text-[12px] font-medium transition-colors border border-transparent cursor-pointer"
              >
                X (Twitter)
              </button>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button onClick={() => setShowLinkModal(false)} className="px-4 py-2 text-[14px] text-[var(--text-secondary)]">Cancel</button>
              <button onClick={handleAddLink} disabled={addingSource || !inputUrl} className="px-5 py-2.5 text-[14px] bg-[var(--accent-solid)] text-[var(--accent-on-solid)] rounded-xl font-medium">Add Link</button>
            </div>
          </div>
        </div>
      )}

      {/* Upload File Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4">
            <h3 className="text-[18px] font-[Satoshi] font-semibold text-[var(--text-primary)]">Upload document</h3>
            <p className="text-[14px] text-[var(--text-secondary)]">
              Select a text, markdown, or PDF document for Aura to learn from.
            </p>
            <input
              type="file"
              accept=".txt,.md,.pdf,.json"
              onChange={handleUploadFile}
              className="w-full text-[14px] text-[var(--text-secondary)] file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-[14px] file:font-medium file:bg-[var(--surface-soft)] file:text-[var(--text-primary)] hover:file:bg-[var(--border)] cursor-pointer"
            />
            <div className="flex items-center justify-end gap-3 pt-2">
              <button onClick={() => setShowUploadModal(false)} className="px-4 py-2 text-[14px] text-[var(--text-secondary)]">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Paste Text Modal */}
      {showTextModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4">
            <h3 className="text-[18px] font-[Satoshi] font-semibold text-[var(--text-primary)]">Paste text note</h3>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={6}
              placeholder="Paste any text or notes for Aura to learn..."
              className="w-full bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl p-3.5 text-[15px] text-[var(--text-primary)] outline-none"
            />
            <div className="flex items-center justify-end gap-3 pt-2">
              <button onClick={() => setShowTextModal(false)} className="px-4 py-2 text-[14px] text-[var(--text-secondary)]">Cancel</button>
              <button onClick={handleAddText} disabled={addingSource || !inputText} className="px-5 py-2.5 text-[14px] bg-[var(--accent-solid)] text-[var(--accent-on-solid)] rounded-xl font-medium">Add Note</button>
            </div>
          </div>
        </div>
      )}

      {/* Processing Loader Modal with ETA Countdown */}
      <ProcessingLoaderModal state={processingState} />

      {/* Payoff Launch Sequence Overlay */}
      {payoffState !== 'idle' && (
        <div className="fixed inset-0 z-[150] bg-[var(--canvas)] flex flex-col items-center justify-center p-6 transition-all duration-300">
          <div className="flex flex-col items-center text-center gap-4 max-w-sm">
            <div className="w-12 h-12 rounded-full bg-[var(--surface-soft)] border border-[var(--border)] flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-[var(--accent-ink)] animate-pulse" />
            </div>

            {payoffState === 'creating' && (
              <>
                <h2 className="text-[24px] font-[Satoshi] font-medium text-[var(--text-primary)]">
                  Creating your Space…
                </h2>
                <span className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mt-2" />
              </>
            )}

            {payoffState === 'live' && (
              <>
                <h2 className="text-[28px] font-[Satoshi] font-semibold text-[var(--text-primary)]">
                  You're live.
                </h2>
                <div className="text-[16px] font-mono text-[var(--accent-ink)] bg-[var(--surface-soft)] px-4 py-1.5 rounded-full border border-[var(--border)]">
                  yullo.co/{handle}
                </div>
              </>
            )}

            {payoffState === 'opening' && (
              <>
                <h2 className="text-[22px] font-[Satoshi] font-medium text-[var(--text-primary)]">
                  Opening your Space…
                </h2>
                <span className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mt-2" />
              </>
            )}
          </div>
        </div>
      )}

      {/* Full-Screen Knowledge Preview Modal */}
      <FullSpaceKnowledgePreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        spaceName={displayName || 'Draft Space'}
        slug={handle}
        purpose={purpose}
        category={categoryState.value}
        description={aboutState.value}
        sources={sources}
      />
    </div>
  );
}
