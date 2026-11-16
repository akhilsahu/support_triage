import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { yulloOnboardingApi } from '../api/onboarding';
import {
  Check, Bot, ArrowLeft, Loader2, User as UserIcon, Briefcase,
  Building, Globe, Link as LinkIcon, Upload, FileText, ChevronRight, Info, Eye
} from 'lucide-react';

import { YulloAppHeader } from '../components/YulloAppHeader';
import { YulloCanvasNetwork } from '../components/YulloCanvasNetwork';
import { SourceUnderstandingCard, type FactItem } from '../components/SourceUnderstandingCard';
import { FullSpaceKnowledgePreviewModal } from '../components/FullSpaceKnowledgePreviewModal';
import { ColouredIcon } from '../components/ColouredIcon';
import { formsApi, type IdentityFormResponse } from '../api/forms';
import { CategoryCombobox } from '../forms/core/CategoryCombobox';
import { useYulloAppStore } from '../store/useYulloAppStore';
import { isAxiosError } from 'axios';
import { motion, useReducedMotion } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';

// Yellow actions are fixed by design; surfaces and text keep the app theme.
const ONBOARDING_COLORS = {
  '--accent': '#FFFC00',
  '--accent-solid': '#FFFC00',
  '--accent-on-solid': '#000000',
} as React.CSSProperties;

const PURPOSES = [
  { id: 'person', title: 'Myself', shortTitle: 'Myself', desc: 'A personal space for your thoughts & AI.', icon: UserIcon },
  { id: 'creator', title: 'A creator', shortTitle: 'Creator', desc: 'Portfolio, resume, and professional work.', icon: Briefcase },
  { id: 'business', title: 'A business or brand', shortTitle: 'Business', desc: 'Engage customers & provide support.', icon: Building },
  { id: 'organization', title: 'A community or organization', shortTitle: 'Community', desc: 'A hub for your group or club.', icon: Globe },
] as const;

export interface AboutState {
  value: string;
  source: 'aura' | 'owner';
  generatedFromVersion?: number;
  auraSuggestion?: string;
}

export function NewSpaceScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const onboarding = location.pathname === '/yullo/onboarding';
  const [params] = useSearchParams();
  const suggestedHandle = params.get('handle') || '';
  const claimedHandle = /^[a-z0-9_-]{3,50}$/.test(suggestedHandle) ? suggestedHandle : '';
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [purposeSelected, setPurposeSelected] = useState(false);
  const [error, setError] = useState('');
  const [initializing, setInitializing] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const customHandle = useRef(Boolean(claimedHandle));
  const sourceTriggerRef = useRef<HTMLButtonElement | null>(null);
  const initialization = useRef<ReturnType<typeof yulloOnboardingApi.resetDraft> | null>(null);
  useEffect(() => { headingRef.current?.focus(); }, [step]);

  const [purpose, setPurpose] = useState<'person' | 'creator' | 'business' | 'organization'>('business');
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');

  const [handleStatus, setHandleStatus] = useState<{ valid: boolean; reason?: string } | null>(null);

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

  const [presence, setPresence] = useState<NonNullable<IdentityFormResponse['presence']> | ''>('');
  const [officialWebsite, setOfficialWebsite] = useState('');
  const [useLinkAsOfficial, setUseLinkAsOfficial] = useState(false);
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

  // Identity suggestions are requested explicitly and never block creation.
  const [showGeneratePrompt, setShowGeneratePrompt] = useState(false);
  const [isGeneratingAbout, setIsGeneratingAbout] = useState(false);

  // Real request status; ingestion readiness does not block Space creation.
  const [processingState, setProcessingState] = useState<{
    active: boolean;
    title: string;
  }>({
    active: false,
    title: '',
  });

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nameVal = e.target.value;
    setDisplayName(nameVal);
    setShowGeneratePrompt(true);

    if (!customHandle.current) {
      setHandleStatus(null);
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
    setPurposeSelected(true);
    setShowGeneratePrompt(true);
  };

  const handleGenerateAbout = async () => {
    setError('');
    setIsGeneratingAbout(true);
    setProcessingState({
      active: true,
      title: 'Writing an introduction…',
      });
    try {
      // Prevent stale-purpose bug: Save current display name and purpose, await draft update
      if (draftId) {
        await yulloOnboardingApi.updateDraft({
          name: displayName.trim() || undefined,
          purpose: purpose,
          description: aboutState.source === 'owner' && aboutState.value.trim() ? aboutState.value.trim() : undefined,
          category: categoryState.source === 'owner' && categoryState.value.trim() ? categoryState.value.trim() : undefined,
        });
      }

      // Call identity generation endpoint with persisted values
      const res = await yulloOnboardingApi.generateSummary(
        { spaceId: draftId || undefined, name: displayName, website: officialWebsite.trim() || undefined,
          purpose, category: categoryState.value, category_source: categoryState.source,
          presence: presence || undefined, description: aboutState.value, description_source: aboutState.source });

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
      setError('Couldn’t write an introduction. You can try again or add one yourself.');
    } finally {
      setIsGeneratingAbout(false);
      setShowGeneratePrompt(false);
      setProcessingState(prev => ({ ...prev, active: false }));
    }
  };

  useEffect(() => {
    let active = true;
    setHandleStatus(null);
    if (!handle) return;
    const timer = setTimeout(async () => {
      try {
        const res = await yulloOnboardingApi.validateHandle(handle);
        if (active) setHandleStatus({ valid: res.valid, reason: res.reason });
      } catch {
        if (active) setHandleStatus({ valid: false, reason: 'Couldn’t check this link. Try editing it again.' });
      }
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [handle]);

  // Mandatory onboarding resumes saved work; explicit new-Space creation stays fresh.
  useEffect(() => {
    const initDraft = async () => {
      try {
        initialization.current ??= onboarding
          ? yulloOnboardingApi.getDraft().catch(error => {
              if (isAxiosError(error) && error.response?.status === 404) return yulloOnboardingApi.createDraft('business');
              throw error;
            })
          : yulloOnboardingApi.resetDraft();
        const freshDraft = await initialization.current;
        // Load canonical optional fields before enabling autosave so resumed values survive.
        const identity = onboarding ? await formsApi.getIdentity(freshDraft.id) : null;
        const savedName = identity?.display_name || '';
        const savedHandle = identity?.slug && !identity.slug.startsWith('draft-') ? identity.slug : '';
        setDisplayName(savedName === 'My Space' ? '' : savedName);
        setHandle(claimedHandle || savedHandle);
        customHandle.current = Boolean(claimedHandle || savedHandle);
        if (identity) setPurpose(identity.purpose);
        setSources(freshDraft.sources || []);
        setAboutState({ value: identity?.description || '', source: identity?.description_source || 'owner' });
        setCategoryState({ value: identity?.category || '', source: 'owner' });
        setPresence(identity?.presence || '');
        setOfficialWebsite(identity?.website || '');
        setDraftId(freshDraft.id);
        setClarification(null);
      } catch {
        setError('Couldn’t start your Space. Refresh to try again.');
      } finally {
        setInitializing(false);
      }
    };
    initDraft();
  }, [claimedHandle, onboarding]);

  // Auto-save draft on every edit with 400ms debounce
  useEffect(() => {
    if (!draftId || isCreating) return;
    const timer = setTimeout(async () => {
      try {
        await yulloOnboardingApi.updateDraft({
          name: displayName.trim() || undefined,
          purpose: purpose,
          description: aboutState.value.trim() || undefined,
          description_source: aboutState.source,
          category: categoryState.value.trim() || undefined,
          category_source: categoryState.source
        });
      } catch (err) {
        console.warn('Auto-save draft failed:', err);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [displayName, purpose, aboutState, categoryState, draftId, isCreating]);

  const handleAddLink = async () => {
    if (!inputUrl.trim()) return;
    const urlToAdd = inputUrl.trim();
    setInputUrl('');
    setShowLinkModal(false);
    setError('');
    setAddingSource(true);
    setProcessingState({
      active: true,
      title: 'Adding your link…',
    });
    try {
      let activeDraftId = draftId;
      if (!activeDraftId) {
        const d = await yulloOnboardingApi.createDraft(purpose);
        activeDraftId = d.id;
        setDraftId(d.id);
      }
      const accepted = await yulloOnboardingApi.addSourceUrl(urlToAdd, 'url', activeDraftId || undefined, undefined, true);
      if (useLinkAsOfficial) {
        setOfficialWebsite(accepted.content_ref || (urlToAdd.startsWith('http') ? urlToAdd : `https://${urlToAdd}`));
        setUseLinkAsOfficial(false);
      }

      setSources(prev => [...prev.filter(source => source.id !== accepted.id), accepted]);
      setShowGeneratePrompt(true);
    } catch (err: any) {
      setInputUrl(urlToAdd);
      setShowLinkModal(true);
      setError('Couldn’t add that link. Check it and try again, or add it later.');
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
    setError('');
    setAddingSource(true);
    setProcessingState({
      active: true,
      title: 'Saving your text…',
    });
    try {
      let activeDraftId = draftId;
      if (!activeDraftId) {
        const d = await yulloOnboardingApi.createDraft(purpose);
        activeDraftId = d.id;
        setDraftId(d.id);
      }
      const accepted = await yulloOnboardingApi.addSourceText(textToAdd, activeDraftId || undefined);
      setSources(prev => [...prev.filter(source => source.id !== accepted.id), accepted]);
      setShowGeneratePrompt(true);
    } catch (err: any) {
      setInputText(textToAdd);
      setShowTextModal(true);
      setError('Couldn’t save that text. Try again, or add it later.');
    } finally {
      setAddingSource(false);
      setProcessingState(prev => ({ ...prev, active: false }));
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setShowUploadModal(false);
    setError('');
    setAddingSource(true);
    setProcessingState({
      active: true,
      title: 'Uploading your file…',
      });
    try {
      let activeDraftId = draftId;
      if (!activeDraftId) {
        const d = await yulloOnboardingApi.createDraft(purpose);
        activeDraftId = d.id;
        setDraftId(d.id);
      }
      const newSource = await yulloOnboardingApi.addSourceFile(file, activeDraftId || undefined);
      setSources(prev => [...prev, newSource]);
      setShowGeneratePrompt(true);
    } catch (err: any) {
      setError('Couldn’t upload that file. Try again, or add it later.');
    } finally {
      setAddingSource(false);
      setProcessingState(prev => ({ ...prev, active: false }));
    }
  };

  const hasProcessingSources = sources.some(source => ['queued', 'processing', 'pending', 'running'].includes(source.status));
  useEffect(() => {
    if (!draftId || !hasProcessingSources) return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const latest = await yulloOnboardingApi.getSpaceSources(draftId);
        if (active) setSources(latest);
      } catch { /* Keep the last known state; a transient read must not lose sources. */ }
    }, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [draftId, hasProcessingSources]);

  const handleDeleteSource = async (id: string) => {
    try {
      await yulloOnboardingApi.deleteSource(id);
      setSources(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      setError('Couldn’t remove that source. Try again.');
    }
  };

  const isValid = displayName.trim().length > 0 && Boolean(handleStatus?.valid) && Boolean(draftId);
  const nameQuestion = {
    person: 'What’s your name?',
    creator: 'What’s your creator name?',
    business: 'What’s your business called?',
    organization: 'What’s your community called?',
  }[purpose];

  const handleCreateSpace = async () => {
    if (!isValid || isCreating || initializing || addingSource) return;
    setIsCreating(true);
    setError('');
    try {
      // Flush all current edits before publication; enrichment remains optional.
      await yulloOnboardingApi.updateDraft({
        name: displayName.trim(), purpose,
        description: aboutState.value.trim(), description_source: aboutState.source,
        category: categoryState.value.trim(), category_source: categoryState.source,
      });
      // Use the same owner-checked identity writer as the main editor so official
      // links become canonical contact channels, independent of source ingestion.
      const currentIdentity = await formsApi.getIdentity(draftId!);
      await formsApi.updateIdentity(draftId!, {
        expected_revision: currentIdentity.revision,
        display_name: displayName.trim(), purpose,
        description: aboutState.value.trim(), description_source: aboutState.source,
        category: categoryState.value.trim(), category_source: categoryState.source,
        presence: presence || undefined, website: officialWebsite.trim(),
        generate_missing_category: false,
      });
      await yulloOnboardingApi.reserveHandle(handle);
      const res = await yulloOnboardingApi.launch(draftId!);
      void queryClient.invalidateQueries({ queryKey: ['home'] });
      const current = useYulloAppStore.getState();
      if (current.user) useYulloAppStore.setState({ user: { ...current.user, onboarding_completed: true } });
      const returnTo = location.state?.returnTo;
      const safeReturn = typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//') && !returnTo.includes('\\') && !returnTo.startsWith('/yullo/onboarding');
      navigate(onboarding ? '/yullo/home' : safeReturn ? returnTo : `/yullo/spaces/${res.space_id || draftId}`, { replace: true });
    } catch {
      setError('Couldn’t save and create your Space. Check your details and official link, then try again. Your entries are still here.');
      setIsCreating(false);
    }
  };

  return (
    <div style={ONBOARDING_COLORS} className="yullo-app relative isolate min-h-[100dvh] bg-[var(--canvas)] text-[var(--text-primary)] font-[Instrument_Sans] [&_button:focus-visible]:outline [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-4 [&_button:focus-visible]:outline-[var(--accent)]">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 opacity-[0.35] sm:opacity-60" style={{ maskImage: 'radial-gradient(ellipse at center, transparent 35%, black 85%)' }}>
        <YulloCanvasNetwork />
      </div>
      <YulloAppHeader />
      <main className="relative z-10 mx-auto w-full max-w-[680px] px-5 pb-12 pt-8 sm:px-8 sm:pt-14">
        <div className="mb-10 flex items-center justify-between gap-6">
          <span className="text-sm text-[var(--text-secondary)]">Create a Space</span>
          <span className="text-sm text-[var(--text-muted)]" aria-live="polite">Step {step} of 4</span>
        </div>
        <ol aria-label="Setup progress" className="mb-10 flex gap-2">
          {['Created for', 'Name', 'Presence', 'Knowledge'].map((label, index) => (
            <li key={label} aria-current={step === index + 1 ? 'step' : undefined} className="flex-1">
              <div className={`mb-2 h-1 rounded-full ${index < step ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`} />
              <span className={`text-xs ${index + 1 === step ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>{label}</span>
            </li>
          ))}
        </ol>
        <motion.section key={step} initial={{ opacity: reducedMotion ? 1 : 0, y: reducedMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.18 }}>
          <h1 ref={headingRef} tabIndex={-1} className="mb-3 font-[Satoshi] text-[clamp(28px,5vw,36px)] font-semibold leading-tight tracking-tight outline-none">
            {step === 1 ? 'How do you want to show up in the world?' : step === 2 ? nameQuestion : step === 3 ? 'Online Presence & Classification' : 'Add knowledge (optional)'}
          </h1>
          <p className="mb-8 text-base leading-relaxed text-[var(--text-secondary)]">
            {step === 1 ? 'Introduce yourself, showcase your work, grow your business, or bring your community together.' : step === 2 ? 'This is the name people will see.' : step === 3 ? 'Choose a category, how you operate, and your official website or channel.' : 'Links, files, and notes help Aura learn. You can add them later.'}
          </p>

          {step === 1 && (
            <fieldset disabled={initializing} className="space-y-3">
              <legend className="mb-3 text-sm font-medium text-[var(--text-secondary)]">Please choose one</legend>
              {PURPOSES.map(option => {
                const Icon = option.icon;
                const selected = purposeSelected && purpose === option.id;
                return (
                  <label key={option.id} className={`flex min-h-[76px] cursor-pointer items-center gap-4 rounded-xl border px-5 py-4 transition-[background-color,border-color,box-shadow,color] duration-150 motion-reduce:transition-none focus-within:ring-2 focus-within:ring-[var(--accent)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--canvas)] ${selected ? 'border-black bg-gradient-to-br from-[#FFFEB0] via-[#FFFC00] to-[#F4E900] text-black shadow-[0_0_24px_rgba(255,252,0,0.35)]' : 'border-[var(--border)] hover:border-[var(--text-muted)]'}`}>
                    <input type="radio" name="purpose" value={option.id} checked={selected} onChange={() => handlePurposeChange(option.id)} className="sr-only" />
                    <Icon aria-hidden="true" className={`h-5 w-5 shrink-0 ${selected ? 'text-black' : 'text-[var(--text-muted)]'}`} />
                    <span className="flex-1 font-medium">{option.title}</span>
                    {selected && <Check aria-hidden="true" className="h-5 w-5 text-black" />}
                  </label>
                );
              })}
            </fieldset>
          )}

          {step === 2 && (
            <div className="space-y-8">
              <div>
                <label htmlFor="space-name" className="mb-3 block text-sm font-medium">{purpose === 'person' ? 'Your name' : `${PURPOSES.find(option => option.id === purpose)?.shortTitle} name`}</label>
                <input id="space-name" name="spaceName" autoComplete={purpose === 'person' ? 'name' : 'organization'} value={displayName} onChange={handleNameChange} maxLength={200} autoFocus
                  onKeyDown={event => { if (event.key === 'Enter' && isValid) setStep(3); }}
                  placeholder={purpose === 'business' ? 'e.g. Acme Studio' : 'Enter a name'}
                  className="h-14 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]" />
              </div>
              <div>
                <label htmlFor="space-handle" className="mb-3 block text-sm font-medium">Your Space link</label>
                <div className="flex min-h-14 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]">
                  <span className="text-base text-[var(--text-muted)]">yullo.co/</span>
                  <input id="space-handle" name="handle" autoComplete="off" spellCheck={false} value={handle} maxLength={50}
                    onChange={event => { customHandle.current = true; setHandleStatus(null); setHandle(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '')); }}
                    aria-describedby="handle-status" aria-invalid={handleStatus?.valid === false}
                    className="min-w-0 flex-1 bg-transparent py-4 text-base outline-none" />
                </div>
                <p id="handle-status" role="status" className="mt-2 text-sm text-[var(--text-secondary)]">
                  {!handle ? 'Choose a link for your Space.' : !handleStatus ? 'Checking availability…' : handleStatus.valid ? 'This link is available. You can edit it.' : handleStatus.reason}
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-7">
              <p className="break-words text-sm text-[var(--text-secondary)]">For <strong className="text-[var(--text-primary)]">{displayName}</strong></p>
              <div className="space-y-6">
                <div>
                  <label htmlFor="onboarding-category" className="mb-3 block text-sm font-medium">Category</label>
                  <CategoryCombobox id="onboarding-category" value={categoryState.value} purpose={purpose} onChange={value => setCategoryState({ value, source: 'owner' })} placeholder="Choose or enter a category" />
                  {categoryState.source === 'aura' && <p className="mt-2 text-xs text-[var(--text-secondary)]">Suggested by Aura</p>}
                </div>
                <div>
                  <label htmlFor="onboarding-presence" className="mb-3 block text-sm font-medium">Presence Type</label>
                  <select id="onboarding-presence" value={presence} onChange={event => setPresence(event.target.value as typeof presence)} className="min-h-[52px] w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]">
                    <option value="" disabled>Choose a presence type</option>
                    <option value="online">Online only</option>
                    <option value="physical">Physical location</option>
                    <option value="both">Online &amp; physical location</option>
                    {presence === 'mobile' && <option value="mobile" hidden disabled>Previously saved presence</option>}
                  </select>
                </div>
                <div>
                  <label htmlFor="official-channel" className="mb-3 block text-sm font-medium">Official Website or Channel</label>
                  <input id="official-channel" name="website" type="url" autoComplete="url" value={officialWebsite} maxLength={500} onChange={event => setOfficialWebsite(event.target.value)} aria-describedby="official-channel-help" placeholder="https://your-website.com" className="min-h-[52px] w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]" />
                  <p id="official-channel-help" className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">Your public website, brand page, or main social channel. It saves when you create your Space.</p>
                  {sources.some(source => /^https?:\/\//i.test(source.content_ref || '')) && (
                    <select aria-label="Use an added link as your official channel" value="" onChange={event => setOfficialWebsite(event.target.value)} className="mt-3 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
                      <option value="" disabled>Choose from your added links</option>
                      {sources.filter(source => /^https?:\/\//i.test(source.content_ref || '')).map(source => <option key={source.id} value={source.content_ref}>{source.title || source.content_ref}</option>)}
                    </select>
                  )}
                </div>
              </div>
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
                      className="px-2.5 py-1 bg-[var(--accent-solid)] text-[var(--accent-on-solid)] rounded-lg font-medium text-[12px] cursor-pointer border border-black"
                    >
                      Use suggestion
                    </button>
                  </div>
                </div>
              )}


            </div>
          )}

          {step === 4 && (
            <div className="space-y-7">

              {clarification && (
                <div role="status" className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-relaxed text-[var(--text-primary)]">
                  <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p>{clarification}</p>
                    <p className="mt-2 text-[var(--text-secondary)]">You can still create your Space and add these details later.</p>
                  </div>
                </div>
              )}
              {/* Knowledge Sub-header matching left column */}
              <div>


                {/* Action Tiles Grid with Always-Visible One-Line Subtitles */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    disabled={addingSource || initializing || isCreating}
                    type="button"
                    onClick={event => { sourceTriggerRef.current = event.currentTarget; setError(''); setShowLinkModal(true); }}
                    className="disabled:opacity-50 min-h-[92px] p-3.5 rounded-[14px] bg-[var(--surface)] text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors border border-[var(--border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] flex flex-col items-center justify-center text-center cursor-pointer"
                  >
                    <div className="flex items-center gap-2 font-medium text-[14px]">
                      <LinkIcon className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                      <span>Add a link</span>
                    </div>
                    <span className="text-[11px] text-[var(--text-secondary)] opacity-70 font-normal block mt-1">
                      Websites, articles, or social links
                    </span>
                  </button>

                  <button
                    disabled={addingSource || initializing || isCreating}
                    type="button"
                    onClick={event => { sourceTriggerRef.current = event.currentTarget; setError(''); setShowUploadModal(true); }}
                    className="disabled:opacity-50 min-h-[92px] p-3.5 rounded-[14px] bg-[var(--surface)] text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors border border-[var(--border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] flex flex-col items-center justify-center text-center cursor-pointer"
                  >
                    <div className="flex items-center gap-2 font-medium text-[14px]">
                      <Upload className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                      <span>Upload</span>
                    </div>
                    <span className="text-[11px] text-[var(--text-secondary)] opacity-70 font-normal block mt-1">
                      PDFs, documents, or images
                    </span>
                  </button>

                  <button
                    disabled={addingSource || initializing || isCreating}
                    type="button"
                    onClick={event => { sourceTriggerRef.current = event.currentTarget; setError(''); setShowTextModal(true); }}
                    className="disabled:opacity-50 min-h-[92px] p-3.5 rounded-[14px] bg-[var(--surface)] text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors border border-[var(--border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] flex flex-col items-center justify-center text-center cursor-pointer"
                  >
                    <div className="flex items-center gap-2 font-medium text-[14px]">
                      <FileText className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                      <span>Paste text</span>
                    </div>
                    <span className="text-[11px] text-[var(--text-secondary)] opacity-70 font-normal block mt-1">
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
                          await yulloOnboardingApi.updateSource(id, { is_confirmed: nextState });
                        } catch (e) {
                          console.warn('Failed to update source confirmed state:', e);
                        }
                      }}
                      onConfirmAllFacts={async (id) => {
                        if (!draftId) return;
                        try {
                          const facts = await yulloOnboardingApi.getSourceFacts(draftId, id);
                          const visible = sources.find(source => source.id === id)?.facts || [];
                          // Hidden preview candidates must not be approved by the bulk action.
                          await Promise.all(facts.filter(fact => fact.review_status === 'extracted' && visible.some((candidate: FactItem | string) =>
                            typeof candidate !== 'string' && candidate.subject === fact.subject
                            && candidate.label === fact.label && candidate.value === fact.value
                          )).map(fact =>
                            yulloOnboardingApi.reviewSourceFact(draftId, id, fact.id, 'owner_confirmed', fact.review_status)
                          ));
                          setShowGeneratePrompt(true);
                        } catch (e) {
                          console.warn('Failed to approve source facts:', e);
                          throw e;
                        }
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="p-6 rounded-[14px] bg-[var(--surface-soft)]/40 border border-transparent text-center text-[14px] text-[var(--text-muted)] leading-relaxed">
                  <p className="font-medium text-[var(--text-secondary)]">You can do this later.</p>
                  <p className="text-[13px] mt-1">You can create the Space now and teach Aura later.</p>
                </div>
              )}

              {hasProcessingSources && <p role="status" className="text-sm text-[var(--text-secondary)]">Aura is still reading. You can create your Space now and review the results later.</p>}
              <details className="border-t border-[var(--border)] pt-5">
                <summary className="cursor-pointer text-sm font-medium text-[var(--text-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">About (optional)</summary>
                <div className="mt-6 space-y-6">

              {/* About Textarea & Aura Provenance */}
              <div>
                {/* Explicit Generation Confirmation Card (On top of About box) */}
                {showGeneratePrompt && (
                  <div className="mb-3.5 p-3.5 bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl flex items-center justify-between gap-3">
                    <span className="text-[13px] font-medium text-[var(--text-primary)] flex items-center gap-1.5">
                      <Bot className="w-4 h-4 text-[var(--accent-ink)] shrink-0" />
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
                        className="px-3 py-1.5 bg-[var(--accent-solid)] text-[var(--accent-on-solid)] text-[12px] font-medium rounded-lg hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 border border-black"
                      >
                        {isGeneratingAbout ? 'Generating...' : 'Yes, generate'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between mb-2.5">
                  <label htmlFor="space-about" className="text-[15px] font-medium text-[var(--text-primary)]">
                    About
                  </label>
                  <span className="text-[13px] text-[var(--text-muted)] font-normal">Optional</span>
                </div>

                <textarea
                  id="space-about"
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
                      <Bot className="w-4 h-4 text-[var(--accent-ink)] shrink-0" />
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
                        className="px-3 py-1.5 bg-[var(--accent-solid)] text-[var(--accent-on-solid)] rounded-lg font-medium text-[12px] hover:opacity-90 transition-opacity shrink-0 ml-3 cursor-pointer border border-black"
                      >
                        Use suggestion
                      </button>
                    </div>
                  )}
                </div>
              </div>


                </div>
              </details>
              {sources.length > 0 && <button type="button" onClick={() => setIsPreviewModalOpen(true)} className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--text-secondary)]"><Eye className="h-4 w-4" />Preview knowledge</button>}
            </div>
          )}
        </motion.section>
        {processingState.active && <p role="status" className="mt-6 flex items-center gap-2 text-sm text-[var(--text-secondary)]"><Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />{processingState.title}</p>}
        {error && <p role="alert" className="mt-6 text-sm text-[var(--text-primary)]">{error}</p>}
        <div className="mt-10 flex items-center justify-between gap-4 border-t border-[var(--border)] pt-6">
          {onboarding && step === 1 ? <span /> : <button type="button" disabled={isCreating} onClick={() => { setError(''); if (step === 1) navigate('/yullo/home'); else setStep((step - 1) as 1 | 2 | 3); }} className="inline-flex min-h-12 items-center gap-2 px-2 text-sm text-[var(--text-secondary)] disabled:opacity-50">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />{step === 1 ? 'Cancel' : 'Back'}
          </button>}
          {step < 4 ? (
            <button type="button" disabled={initializing || (step === 1 ? !purposeSelected : !isValid)} onClick={() => { setError(''); setStep((step + 1) as 2 | 3 | 4); }} className="inline-flex min-h-[52px] items-center gap-2 rounded-xl bg-[var(--accent)] px-6 font-medium text-[var(--accent-on-solid)] transition-opacity hover:opacity-90 disabled:opacity-40 border border-black">
              {initializing ? 'Getting ready…' : 'Continue'}<ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <button type="button" disabled={!isValid || isCreating || addingSource || isGeneratingAbout} onClick={handleCreateSpace} className="inline-flex min-h-[52px] items-center gap-2 rounded-xl bg-[var(--accent)] px-6 font-medium text-[var(--accent-on-solid)] transition-opacity hover:opacity-90 disabled:opacity-40 border border-black">
              {isCreating ? <><Loader2 className="h-4 w-4 motion-safe:animate-spin" />Creating…</> : addingSource ? 'Saving source…' : sources.length ? 'Create Space' : 'Skip for now & create'}
            </button>
          )}
        </div>
      </main>

      {/* Add Link Modal with Onboarding Link Suggestions */}
      {showLinkModal && (
        <Dialog.Root open={showLinkModal} onOpenChange={setShowLinkModal}>
          <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/60" />
          <Dialog.Content aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); sourceTriggerRef.current?.focus(); }} className="fixed left-1/2 top-1/2 z-[110] max-h-[85dvh] w-[calc(100%_-_32px)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text-primary)] shadow-2xl flex flex-col gap-4">
            <Dialog.Title className="text-[18px] font-[Satoshi] font-semibold text-[var(--text-primary)]">Add a link</Dialog.Title>
            <input
              aria-label="Website or social link"
              type="url"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full h-[52px] px-4.5 bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:bg-[var(--surface)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 outline-none transition-colors font-[Instrument_Sans]"
              autoFocus
            />

            {/* Quick Link Suggestions Row matching Onboarding */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[12px] text-[var(--text-muted)] font-medium mr-1 select-none">Suggestions:</span>
              <button
                type="button"
                onClick={() => setInputUrl('https://example.com')}
                className="px-2.5 py-1 rounded-lg bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 text-[12px] font-medium transition-colors border border-black cursor-pointer"
              >
                Website
              </button>
              <button
                type="button"
                onClick={() => setInputUrl('https://youtube.com/@username')}
                className="px-2.5 py-1 rounded-lg bg-[var(--surface-soft)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] text-[12px] font-medium transition-colors border border-[var(--border)] cursor-pointer inline-flex items-center gap-1.5"
              >
                <ColouredIcon name="youtube" className="w-3.5 h-3.5" />
                YouTube
              </button>
              <button
                type="button"
                onClick={() => setInputUrl('https://linkedin.com/in/username')}
                className="px-2.5 py-1 rounded-lg bg-[var(--surface-soft)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] text-[12px] font-medium transition-colors border border-[var(--border)] cursor-pointer inline-flex items-center gap-1.5"
              >
                <ColouredIcon name="linkedin" className="w-3.5 h-3.5" />
                LinkedIn
              </button>
              <button
                type="button"
                onClick={() => setInputUrl('https://instagram.com/username')}
                className="px-2.5 py-1 rounded-lg bg-[var(--surface-soft)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] text-[12px] font-medium transition-colors border border-[var(--border)] cursor-pointer inline-flex items-center gap-1.5"
              >
                <ColouredIcon name="instagram" className="w-3.5 h-3.5" />
                Instagram
              </button>
              <button
                type="button"
                onClick={() => setInputUrl('https://x.com/username')}
                className="px-2.5 py-1 rounded-lg bg-[var(--surface-soft)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] text-[12px] font-medium transition-colors border border-[var(--border)] cursor-pointer inline-flex items-center gap-1.5"
              >
                <ColouredIcon name="x" className="w-3.5 h-3.5" />
                X (Twitter)
              </button>
            </div>

            <label className="flex min-h-11 items-start gap-3 text-sm text-[var(--text-primary)]">
              <input type="checkbox" checked={useLinkAsOfficial} onChange={event => setUseLinkAsOfficial(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" />
              <span>Use as my official website or channel<span className="mt-1 block text-xs text-[var(--text-secondary)]">This link will appear publicly after you create your Space.</span></span>
            </label>
            {error && <p role="alert" className="text-sm text-[var(--text-primary)]">{error}</p>}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button onClick={() => setShowLinkModal(false)} className="px-4 py-2 text-[14px] text-[var(--text-secondary)]">Cancel</button>
              <button onClick={handleAddLink} disabled={addingSource || !inputUrl} className="px-5 py-2.5 text-[14px] bg-[var(--accent-solid)] text-[var(--accent-on-solid)] rounded-xl font-medium border border-black">Add Link</button>
            </div>
          </Dialog.Content>
        </Dialog.Root>
      )}

      {/* Upload File Modal */}
      {showUploadModal && (
        <Dialog.Root open={showUploadModal} onOpenChange={setShowUploadModal}>
          <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/60" />
          <Dialog.Content aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); sourceTriggerRef.current?.focus(); }} className="fixed left-1/2 top-1/2 z-[110] max-h-[85dvh] w-[calc(100%_-_32px)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text-primary)] shadow-2xl flex flex-col gap-4">
            <Dialog.Title className="text-[18px] font-[Satoshi] font-semibold text-[var(--text-primary)]">Upload document</Dialog.Title>
            <p className="text-[14px] text-[var(--text-secondary)]">
              Choose a PDF, document, text file, or image (up to 20 MB).
            </p>
            <input
              aria-label="Upload a file"
              type="file"
              accept=".pdf,.docx,.txt,.md,.markdown,.png,.jpg,.jpeg,.webp"
              onChange={handleUploadFile}
              className="w-full text-[14px] text-[var(--text-secondary)] file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-[14px] file:font-medium file:bg-[var(--surface-soft)] file:text-[var(--text-primary)] hover:file:bg-[var(--border)] cursor-pointer"
            />
            {error && <p role="alert" className="text-sm text-[var(--text-primary)]">{error}</p>}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button onClick={() => setShowUploadModal(false)} className="px-4 py-2 text-[14px] text-[var(--text-secondary)]">Cancel</button>
            </div>
          </Dialog.Content>
        </Dialog.Root>
      )}

      {/* Paste Text Modal */}
      {showTextModal && (
        <Dialog.Root open={showTextModal} onOpenChange={setShowTextModal}>
          <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/60" />
          <Dialog.Content aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); sourceTriggerRef.current?.focus(); }} className="fixed left-1/2 top-1/2 z-[110] max-h-[85dvh] w-[calc(100%_-_32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text-primary)] shadow-2xl flex flex-col gap-4">
            <Dialog.Title className="text-[18px] font-[Satoshi] font-semibold text-[var(--text-primary)]">Paste text note</Dialog.Title>
            <textarea
              aria-label="Text for Aura to learn from"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={6}
              placeholder="Paste any text or notes for Aura to learn..."
              className="w-full bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl p-4 text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:bg-[var(--surface)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 outline-none transition-colors font-[Instrument_Sans] resize-y leading-relaxed"
              autoFocus
            />
            {error && <p role="alert" className="text-sm text-[var(--text-primary)]">{error}</p>}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button onClick={() => setShowTextModal(false)} className="px-4 py-2 text-[14px] text-[var(--text-secondary)]">Cancel</button>
              <button onClick={handleAddText} disabled={addingSource || !inputText} className="px-5 py-2.5 text-[14px] bg-[var(--accent-solid)] text-[var(--accent-on-solid)] rounded-xl font-medium border border-black">Add Note</button>
            </div>
          </Dialog.Content>
        </Dialog.Root>
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
