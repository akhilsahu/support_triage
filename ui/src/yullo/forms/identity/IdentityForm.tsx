import React, { useState, useEffect, useRef } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { TextField } from '../core/TextField';
import { TextAreaField } from '../core/TextAreaField';
import { SelectField } from '../core/SelectField';
import { yulloOnboardingApi, AboutSuggestionResponse } from '../../api/onboarding';
import { 
  Sparkles, Upload, Trash2, Link as LinkIcon, FileText, Info,
  User as UserIcon, Briefcase, Building, Globe, Check, Pencil, X, Loader2
} from 'lucide-react';
import { SourceUnderstandingCard, SourceItem } from '../../components/SourceUnderstandingCard';
import { ProcessingLoaderSystem, ProcessingState } from '../../components/ProcessingLoaderSystem';

export const identitySchema = z.object({
  purpose: z.enum(['business', 'creator', 'person', 'organization'] as const, { message: 'Purpose is required' }),
  display_name: z.string().min(1, 'Display name is required').max(200),
  description: z.string().max(280).optional().nullable(),
  description_source: z.enum(['owner', 'aura']).optional().nullable(),
  description_prompt_version: z.string().optional().nullable(),
  description_input_fingerprint: z.string().optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  category_source: z.enum(['owner', 'aura']).optional().nullable(),
  category_prompt_version: z.string().optional().nullable(),
  category_input_fingerprint: z.string().optional().nullable(),
  presence: z.enum(['online', 'physical', 'both', 'mobile']).optional().nullable().or(z.literal('')),
  website: z.string().url('Must be a valid URL (http:// or https://)').optional().nullable().or(z.literal('')),
  logo_url: z.string().optional().nullable().or(z.literal('')),
  expected_revision: z.number().int().optional(),
});

export type IdentityFormValues = z.infer<typeof identitySchema>;

const PURPOSES = [
  { id: 'person', title: 'Myself', shortTitle: 'Myself', desc: 'A personal space for your thoughts & AI.', icon: UserIcon },
  { id: 'creator', title: 'My work / Creator', shortTitle: 'Creator', desc: 'Portfolio, resume, and professional work.', icon: Briefcase },
  { id: 'business', title: 'A business or brand', shortTitle: 'Business', desc: 'Engage customers & provide support.', icon: Building },
  { id: 'organization', title: 'A community or organization', shortTitle: 'Community', desc: 'A hub for your group or club.', icon: Globe },
] as const;

interface IdentityFormProps {
  form: UseFormReturn<IdentityFormValues>;
  spaceId?: string;
  slug?: string;
  onChangeHandle?: () => void;
  onSubmit: (data: IdentityFormValues) => void;
  isSubmitting?: boolean;
  sources?: SourceItem[];
  onAddLink?: (url: string) => Promise<void>;
  onUploadFile?: (file: File) => Promise<void>;
  onAddText?: (text: string) => Promise<void>;
  onRemoveSource?: (sourceId: string) => Promise<void>;
  onToggleConfirm?: (sourceId: string, nextState: boolean) => Promise<void>;
}

export function IdentityForm({ 
  form, 
  spaceId, 
  slug, 
  onChangeHandle, 
  onSubmit, 
  sources = [],
  onAddLink,
  onUploadFile,
  onAddText,
  onRemoveSource,
  onToggleConfirm
}: IdentityFormProps) {
  const [suggestion, setSuggestion] = useState<AboutSuggestionResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showLogoUrlInput, setShowLogoUrlInput] = useState(false);

  // Source Modals & ETA Processing System
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showTextModal, setShowTextModal] = useState(false);
  const [inputUrl, setInputUrl] = useState('');
  const [inputText, setInputText] = useState('');
  const [addingSource, setAddingSource] = useState(false);
  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);

  const [processingState, setProcessingState] = useState<ProcessingState>({
    active: false,
    title: '',
    subtitle: '',
    estimatedSeconds: 5
  });

  // Editable Name & Handle state
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const transition = shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

  const currentDisplayName = form.watch('display_name');
  const currentPurpose = form.watch('purpose');
  const currentLogoUrl = form.watch('logo_url');
  const categorySource = form.watch('category_source');

  const fetchAuraSuggestion = async () => {
    setIsGenerating(true);
    try {
      const res = await yulloOnboardingApi.generateSummary({
        spaceId: spaceId,
        name: currentDisplayName,
      });
      setSuggestion(res);
      setDismissed(false);

      if (res.status === 'ready') {
        if (res.description && form.getValues('description_source') !== 'owner') {
          form.setValue('description', res.description, { shouldDirty: true });
          form.setValue('description_source', 'aura', { shouldDirty: true });
        }
        if (res.category && form.getValues('category_source') !== 'owner') {
          form.setValue('category', res.category, { shouldDirty: true });
          form.setValue('category_source', 'aura', { shouldDirty: true });
        }
      }
    } catch (e) {
      console.warn('Failed to fetch Aura identity suggestion:', e);
      setSuggestion({ status: 'unavailable', clarification: 'Generation service is currently unavailable.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        form.setValue('logo_url', dataUrl, { shouldDirty: true });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddLinkSubmit = async () => {
    if (!inputUrl.trim() || !onAddLink) return;
    const urlToAdd = inputUrl.trim();
    setInputUrl('');
    setShowLinkModal(false);
    setAddingSource(true);
    setProcessingState({
      active: true,
      title: 'Analyzing Link & Scraping Content',
      subtitle: `Fetching ${urlToAdd} and verifying grounded facts...`,
      estimatedSeconds: 6
    });
    try {
      await onAddLink(urlToAdd);
    } catch (err) {
      console.error('Failed to add link:', err);
    } finally {
      setAddingSource(false);
      setProcessingState(prev => ({ ...prev, active: false }));
    }
  };

  const handleAddTextSubmit = async () => {
    if (!inputText.trim() || !onAddText) return;
    const textToAdd = inputText.trim();
    setInputText('');
    setShowTextModal(false);
    setAddingSource(true);
    setProcessingState({
      active: true,
      title: 'Analyzing Text Note',
      subtitle: 'Indexing note content & extracting facts for Aura...',
      estimatedSeconds: 4
    });
    try {
      await onAddText(textToAdd);
    } catch (err) {
      console.error('Failed to add note:', err);
    } finally {
      setAddingSource(false);
      setProcessingState(prev => ({ ...prev, active: false }));
    }
  };

  const handleUploadFileSubmit = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUploadFile) return;
    setShowUploadModal(false);
    setAddingSource(true);
    setProcessingState({
      active: true,
      title: 'Parsing & Indexing Document',
      subtitle: `Extracting text & facts from ${file.name}...`,
      estimatedSeconds: 7
    });
    try {
      await onUploadFile(file);
    } catch (err) {
      console.error('Failed to upload file:', err);
    } finally {
      setAddingSource(false);
      setProcessingState(prev => ({ ...prev, active: false }));
    }
  };

  const handleRemoveSourceWithLoader = async (sourceId: string) => {
    if (!onRemoveSource) return;
    setDeletingSourceId(sourceId);
    try {
      await onRemoveSource(sourceId);
    } catch (err) {
      console.error('Failed to remove source:', err);
    } finally {
      setDeletingSourceId(null);
    }
  };

  const logoLabel = (currentPurpose === 'person' || currentPurpose === 'creator') ? 'Photo' : 'Logo or photo';

  return (
    <form id="identity-form" onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col relative pb-8">
      
      {/* Top Header: Editable Name & Address */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-[var(--border)]">
        <div>
          {isEditingTitle ? (
            <div className="flex items-center gap-2 max-w-md">
              <input
                type="text"
                {...form.register('display_name')}
                onBlur={() => setIsEditingTitle(false)}
                onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingTitle(false); }}
                className="text-[clamp(24px,3vw,36px)] leading-tight font-[Satoshi] font-semibold tracking-tight bg-transparent text-[var(--text-primary)] border-b-2 border-[var(--accent)] px-0 py-1 outline-none w-full"
                placeholder="Enter space name..."
                autoFocus
              />
              <Check className="w-6 h-6 text-emerald-500 shrink-0 cursor-pointer" onClick={() => setIsEditingTitle(false)} />
            </div>
          ) : (
            <div
              onClick={() => setIsEditingTitle(true)}
              className="group flex items-center gap-3 cursor-pointer py-1 px-2 -ml-2 rounded-xl hover:bg-[var(--surface-soft)] transition-colors w-fit"
              title="Click to edit space name"
            >
              <h1 className="text-[clamp(24px,3vw,36px)] leading-tight font-[Satoshi] font-semibold tracking-tight text-[var(--text-primary)]">
                {currentDisplayName || 'Unnamed Space'}
              </h1>
              <Pencil className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--accent-ink)] opacity-60 transition-opacity" />
            </div>
          )}
        </div>

        {slug && (
          <div 
            onClick={onChangeHandle}
            className="group flex items-center gap-2.5 min-h-[44px] px-4 rounded-[12px] bg-[var(--surface-soft)] border border-[var(--border)] hover:border-[var(--accent)] cursor-pointer transition-colors w-fit"
            title="Click to edit Yullo address"
          >
            <span className="text-[15px] font-mono text-[var(--text-primary)]">
              yullo.com/{slug}
            </span>
            <Pencil className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent-ink)] opacity-60 transition-opacity" />
          </div>
        )}
      </div>

      {/* 2-COLUMN GRID (Matching Add Space design) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        
        {/* COLUMN 1: IDENTITY */}
        <section className="space-y-6">
          <div className="border-b border-[var(--border)] pb-2 flex items-center justify-between">
            <h2 className="text-[18px] font-semibold text-[var(--text-primary)] flex items-center">
              <span className="text-[14px] font-normal text-[var(--text-muted)] font-mono mr-3">01</span>
              Identity
            </h2>
          </div>

          {/* Purpose Selector - 4 columns sitting in 1 row */}
          <div>
            <label className="block text-[14px] font-medium text-[var(--text-primary)] mb-2.5">
              Space Purpose
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PURPOSES.map((p) => {
                const Icon = p.icon;
                const isSelected = currentPurpose === p.id;
                return (
                  <div key={p.id} className="relative group/tooltip w-full">
                    <button
                      type="button"
                      onClick={() => form.setValue('purpose', p.id as any, { shouldDirty: true })}
                      className={`w-full min-h-[44px] px-2 py-2 rounded-xl border text-[13px] font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        isSelected 
                          ? 'border-[var(--accent)] bg-[var(--surface-soft)] text-[var(--text-primary)] shadow-sm font-semibold' 
                          : 'border-[var(--border)] hover:border-[var(--text-secondary)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-[var(--accent-ink)]' : 'text-[var(--text-muted)]'}`} />
                      <span className="truncate text-center">{p.shortTitle}</span>
                    </button>

                    {/* Tooltip */}
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

          {/* Category & Presence */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[14px] font-medium text-[var(--text-primary)]">
                  Category
                </label>
                {categorySource === 'aura' && (
                  <span className="text-[12px] font-semibold text-[var(--accent-ink)] flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Suggested by Aura
                  </span>
                )}
              </div>
              <TextField
                label=""
                placeholder="e.g. Design studio"
                registration={form.register('category', {
                  onChange: () => {
                    form.setValue('category_source', 'owner');
                  }
                })}
                error={form.formState.errors.category?.message}
              />
            </div>
            <div>
              <div className="mb-1.5">
                <label className="text-[14px] font-medium text-[var(--text-primary)]">
                  Presence
                </label>
              </div>
              <SelectField
                label=""
                control={form.control as any}
                name="presence"
                error={form.formState.errors.presence?.message}
                options={[
                  { value: '', label: 'Select...' },
                  { value: 'online', label: 'Online' },
                  { value: 'physical', label: 'Physical' },
                  { value: 'both', label: 'Online and physical' },
                  { value: 'mobile', label: 'Mobile' },
                ]}
              />
            </div>
          </div>

          {/* About Description */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[14px] font-medium text-[var(--text-primary)]">
                About this Space
              </label>
              <button
                type="button"
                onClick={fetchAuraSuggestion}
                disabled={isGenerating}
                className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--focus)] hover:text-[var(--focus-soft)] disabled:opacity-50 transition-colors cursor-pointer bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
              >
                {isGenerating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-ink)]" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-[var(--accent-ink)]" />
                )}
                <span>{isGenerating ? 'Generating...' : 'Suggest with Aura'}</span>
              </button>
            </div>

            <TextAreaField
              label=""
              placeholder="What should visitors know about this Space?"
              registration={form.register('description', {
                onChange: () => {
                  form.setValue('description_source', 'owner');
                }
              })}
              error={form.formState.errors.description?.message}
            />

            <AnimatePresence>
              {suggestion && !dismissed && (
                <motion.div 
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={transition}
                  className="mt-3 p-4 bg-[var(--surface-soft)] rounded-xl border border-[var(--border)]"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] font-semibold text-[var(--accent-ink)] tracking-wide flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> Suggested by Aura
                    </span>
                    <div className="flex items-center gap-3">
                      <button 
                        type="button" 
                        onClick={() => setDismissed(true)} 
                        className="text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        Dismiss
                      </button>
                      {suggestion.status === 'ready' && (suggestion.description || suggestion.category) && (
                        <button 
                          type="button" 
                          onClick={() => { 
                            if (suggestion.description) {
                              form.setValue('description', suggestion.description, { shouldDirty: true }); 
                              form.setValue('description_source', 'aura', { shouldDirty: true });
                            }
                            if (suggestion.category) {
                              form.setValue('category', suggestion.category, { shouldDirty: true }); 
                              form.setValue('category_source', 'aura', { shouldDirty: true });
                            }
                            setDismissed(true);
                          }} 
                          className="text-[13px] font-medium text-[var(--focus)] hover:text-[var(--focus-soft)] cursor-pointer"
                        >
                          Use suggestion
                        </button>
                      )}
                    </div>
                  </div>

                  {suggestion.status === 'needs_clarification' && suggestion.clarification && (
                    <p className="text-[14px] text-amber-300 font-medium leading-relaxed">
                      {suggestion.clarification}
                    </p>
                  )}

                  {suggestion.status === 'ready' && (
                    <div className="space-y-1">
                      {suggestion.category && (
                        <p className="text-[13px] text-[var(--text-secondary)] font-medium">
                          Category: <span className="text-[var(--text-primary)] font-semibold">{suggestion.category}</span>
                        </p>
                      )}
                      {suggestion.description && (
                        <p className="text-[14px] text-[var(--text-primary)] leading-relaxed">
                          {suggestion.description}
                        </p>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Logo / Photo */}
          <div className="flex flex-col gap-2 pt-2">
            <label className="text-[13px] font-semibold text-[var(--text-secondary)]">
              {logoLabel}
            </label>
            {currentLogoUrl ? (
              <div className="flex items-center gap-4 p-3 bg-[var(--surface-soft)] rounded-xl border border-[var(--border)]">
                <img
                  src={currentLogoUrl}
                  alt={logoLabel}
                  className="w-14 h-14 rounded-lg object-cover border border-[var(--border)] shrink-0 bg-[var(--surface)]"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                    {currentLogoUrl.startsWith('data:') ? 'Uploaded image' : currentLogoUrl}
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[12px] font-medium text-[var(--focus)] cursor-pointer"
                    >
                      Change photo
                    </button>
                    <button
                      type="button"
                      onClick={() => form.setValue('logo_url', '', { shouldDirty: true })}
                      className="text-[12px] font-medium text-[#ef4444] cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[var(--surface-soft)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border)] rounded-xl text-[13px] font-medium transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-[var(--focus)]" />
                  Upload photo
                </button>
                <button
                  type="button"
                  onClick={() => setShowLogoUrlInput(!showLogoUrlInput)}
                  className="text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  {showLogoUrlInput ? 'Hide URL' : 'Or paste URL'}
                </button>
              </div>
            )}

            {showLogoUrlInput && !currentLogoUrl && (
              <TextField
                label=""
                placeholder="https://example.com/logo.png"
                registration={form.register('logo_url')}
                error={form.formState.errors.logo_url?.message}
              />
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

        </section>

      </div>
    </form>
  );
}
