import React, { useState, useRef } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { yulloOnboardingApi, AboutSuggestionResponse } from '../../api/onboarding';
import { 
  Sparkles, Upload, Trash2, Globe, Link as LinkIcon,
  User as UserIcon, Briefcase, Building, Check, Pencil,
  Loader2, ArrowRight, Eye, ShieldCheck, MapPin, AlertCircle
} from 'lucide-react';
import { SourceItem } from '../../components/SourceUnderstandingCard';

export const identitySchema = z.object({
  purpose: z.enum(['business', 'creator', 'person', 'organization'] as const, { message: 'Purpose is required' }),
  display_name: z.string().min(1, 'Display name is required').max(200),
  description: z.string().max(280, 'Maximum 280 characters').optional().nullable(),
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
  { id: 'person', title: 'Myself', shortTitle: 'Myself', desc: 'Personal portfolio, thoughts & AI companion.', icon: UserIcon },
  { id: 'creator', title: 'Creator', shortTitle: 'Creator', desc: 'Work, projects, creative resume & media.', icon: Briefcase },
  { id: 'business', title: 'Business', shortTitle: 'Business', desc: 'Brand identity, customer engagement & support.', icon: Building },
  { id: 'organization', title: 'Community', shortTitle: 'Community', desc: 'Hub for organizations, teams or clubs.', icon: Globe },
] as const;

const PRESENCE_OPTIONS = [
  { value: '', label: 'Select presence type...' },
  { value: 'online', label: 'Online only' },
  { value: 'physical', label: 'Physical location' },
  { value: 'both', label: 'Online & physical location' },
  { value: 'mobile', label: 'Mobile / Pop-up service' },
] as const;

interface IdentityFormProps {
  form: UseFormReturn<IdentityFormValues>;
  spaceId?: string;
  slug?: string;
  isLive?: boolean;
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
  isLive = false,
  onChangeHandle, 
  onSubmit, 
}: IdentityFormProps) {
  const [suggestion, setSuggestion] = useState<AboutSuggestionResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showLogoUrlInput, setShowLogoUrlInput] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const transition = shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

  // Watch form fields for live feedback and preview
  const currentDisplayName = form.watch('display_name');
  const currentPurpose = form.watch('purpose');
  const currentCategory = form.watch('category');
  const currentPresence = form.watch('presence');
  const currentDescription = form.watch('description');
  const currentWebsite = form.watch('website');
  const currentLogoUrl = form.watch('logo_url');
  const categorySource = form.watch('category_source');

  const fetchAuraSuggestion = async () => {
    setIsGenerating(true);
    try {
      const res = await yulloOnboardingApi.generateSummary({
        spaceId: spaceId,
        name: currentDisplayName || 'Space',
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
      setSuggestion({ status: 'unavailable', clarification: 'AI suggestion is currently unavailable. Please enter details manually.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = (file: File) => {
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleFileUpload(file);
    }
  };

  const normalizeUrl = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return '';
    if (!/^https?:\/\//i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    return trimmed;
  };

  const currentPurposeObj = PURPOSES.find(p => p.id === currentPurpose) || PURPOSES[0];
  const presenceLabel = PRESENCE_OPTIONS.find(p => p.value === currentPresence)?.label;

  return (
    <form id="identity-form" onSubmit={form.handleSubmit(onSubmit)} className="w-full flex flex-col font-[Instrument_Sans]">
      
      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
        
        {/* ========================================================================= */}
        {/* LEFT COLUMN: FORM CONTROLS (7 of 12 cols on desktop)                      */}
        {/* ========================================================================= */}
        <div className="lg:col-span-7 space-y-8">

          {/* Section 1: Core Space Identity */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-7 shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
              <h2 className="text-[17px] font-semibold text-[var(--text-primary)] font-[Satoshi] flex items-center gap-2.5">
                <span className="text-[12px] font-mono px-2 py-0.5 rounded-md bg-[var(--surface-soft)] text-[var(--text-secondary)] border border-[var(--border)]">
                  01
                </span>
                Identity & Handle
              </h2>
              <span className="text-xs text-[var(--text-muted)] font-mono">Required details</span>
            </div>

            {/* Space Name */}
            <div>
              <label className="block text-[14px] font-semibold text-[var(--text-primary)] mb-2">
                Space Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  {...form.register('display_name')}
                  placeholder="e.g. SpaceX"
                  className="w-full px-4 py-3 rounded-xl bg-[var(--surface-soft)] border border-[var(--border)] text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:ring-2 focus:ring-[var(--focus-soft)] transition-all font-[Instrument_Sans]"
                />
              </div>
              {form.formState.errors.display_name && (
                <p className="mt-1.5 text-xs text-rose-500 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {form.formState.errors.display_name.message}
                </p>
              )}
            </div>

            {/* Space Handle / Slug */}
            <div>
              <label className="block text-[14px] font-semibold text-[var(--text-primary)] mb-2">
                Public Yullo Address
              </label>
              <div className="flex items-center justify-between gap-3 p-3 bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl">
                <div className="flex items-center min-w-0 font-mono text-[14px] truncate">
                  <span className="text-[var(--text-muted)] select-none">yullo.com/</span>
                  <span className="font-semibold text-[var(--text-primary)] truncate">{slug || 'your-space'}</span>
                </div>
                {onChangeHandle && (
                  <button
                    type="button"
                    onClick={onChangeHandle}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--surface)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border)] transition-colors cursor-pointer"
                  >
                    <Pencil className="w-3 h-3 text-[var(--accent-ink)]" />
                    <span>Change address</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5">
                This is the unique URL visitors use to access your public Space.
              </p>
            </div>
          </section>

          {/* Section 2: Space Purpose */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-7 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
              <h2 className="text-[17px] font-semibold text-[var(--text-primary)] font-[Satoshi] flex items-center gap-2.5">
                <span className="text-[12px] font-mono px-2 py-0.5 rounded-md bg-[var(--surface-soft)] text-[var(--text-secondary)] border border-[var(--border)]">
                  02
                </span>
                Space Purpose
              </h2>
              <span className="text-xs text-[var(--text-muted)]">Select one</span>
            </div>

            <p className="text-[13px] text-[var(--text-secondary)]">
              Helps visitors understand who this Space represents and tunes Aura's persona.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {PURPOSES.map((p) => {
                const Icon = p.icon;
                const isSelected = currentPurpose === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => form.setValue('purpose', p.id as any, { shouldDirty: true })}
                    className={`relative p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[96px] group ${
                      isSelected 
                        ? 'border-[var(--accent)] bg-[var(--surface-soft)] shadow-xs ring-1 ring-[var(--accent)]' 
                        : 'border-[var(--border)] hover:border-[var(--text-secondary)] bg-[var(--surface)] hover:bg-[var(--surface-soft)]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                        isSelected 
                          ? 'bg-[var(--accent-solid)] text-[var(--accent-on-solid)]' 
                          : 'bg-[var(--surface-soft)] text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      {isSelected && (
                        <div className="w-4 h-4 rounded-full bg-[var(--accent-solid)] text-[var(--accent-on-solid)] flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div>
                      <div className={`text-[13px] font-semibold leading-tight ${isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]'}`}>
                        {p.shortTitle}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 line-clamp-1 leading-normal">
                        {p.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section 3: Classification & Presence */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-7 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
              <h2 className="text-[17px] font-semibold text-[var(--text-primary)] font-[Satoshi] flex items-center gap-2.5">
                <span className="text-[12px] font-mono px-2 py-0.5 rounded-md bg-[var(--surface-soft)] text-[var(--text-secondary)] border border-[var(--border)]">
                  03
                </span>
                Classification & Online Presence
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Category */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[13px] font-semibold text-[var(--text-primary)]">
                    Category
                  </label>
                  {categorySource === 'aura' && (
                    <span className="text-[11px] font-semibold text-[var(--accent-ink)] flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Aura suggestion
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  {...form.register('category', {
                    onChange: () => form.setValue('category_source', 'owner', { shouldDirty: true })
                  })}
                  placeholder="e.g. Space technology company"
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--surface-soft)] border border-[var(--border)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)] transition-all font-[Instrument_Sans]"
                />
              </div>

              {/* Presence */}
              <div>
                <label className="block text-[13px] font-semibold text-[var(--text-primary)] mb-1.5">
                  Presence Type
                </label>
                <div className="relative">
                  <select
                    {...form.register('presence')}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--surface-soft)] border border-[var(--border)] text-[14px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)] transition-all font-[Instrument_Sans] appearance-none cursor-pointer pr-10"
                  >
                    {PRESENCE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-[var(--surface)] text-[var(--text-primary)]">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]">
                    <ArrowRight className="w-3.5 h-3.5 rotate-90" />
                  </div>
                </div>
              </div>
            </div>

            {/* Official Website */}
            <div>
              <label className="block text-[13px] font-semibold text-[var(--text-primary)] mb-1.5">
                Official Website
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                  <Globe className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  {...form.register('website', {
                    onBlur: (e) => {
                      const normalized = normalizeUrl(e.target.value);
                      form.setValue('website', normalized, { shouldDirty: true });
                    }
                  })}
                  placeholder="https://spacex.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--surface-soft)] border border-[var(--border)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)] transition-all font-[Instrument_Sans]"
                />
              </div>
              {form.formState.errors.website && (
                <p className="mt-1.5 text-xs text-rose-500 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {form.formState.errors.website.message}
                </p>
              )}
            </div>
          </section>

          {/* Section 4: About Description */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-7 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="text-[12px] font-mono px-2 py-0.5 rounded-md bg-[var(--surface-soft)] text-[var(--text-secondary)] border border-[var(--border)]">
                  04
                </span>
                <h2 className="text-[17px] font-semibold text-[var(--text-primary)] font-[Satoshi]">
                  About this Space
                </h2>
              </div>

              {/* Suggest with Aura Pill Button */}
              <button
                type="button"
                onClick={fetchAuraSuggestion}
                disabled={isGenerating}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[var(--surface-soft)] hover:bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--accent)] shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {isGenerating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-ink)]" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-[var(--accent-ink)]" />
                )}
                <span>{isGenerating ? 'Generating...' : 'Suggest with Aura'}</span>
              </button>
            </div>

            <p className="text-[13px] text-[var(--text-secondary)]">
              A concise summary explaining what this space does, what visitors can explore, or who you are.
            </p>

            <div className="relative">
              <textarea
                {...form.register('description', {
                  onChange: () => form.setValue('description_source', 'owner', { shouldDirty: true })
                })}
                rows={4}
                maxLength={280}
                placeholder="SpaceX designs, manufactures and launches advanced rockets and spacecraft..."
                className="w-full p-4 rounded-xl bg-[var(--surface-soft)] border border-[var(--border)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)] transition-all font-[Instrument_Sans] resize-none leading-relaxed"
              />
              <div className="absolute right-3 bottom-3 text-[11px] font-mono text-[var(--text-muted)]">
                {(currentDescription || '').length}/280
              </div>
            </div>

            {/* Aura Suggestion Banner */}
            <AnimatePresence>
              {suggestion && !dismissed && (
                <motion.div 
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={transition}
                  className="p-4 bg-[var(--surface-soft)] rounded-xl border border-[var(--accent)]/40 shadow-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-[var(--accent-ink)] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> Aura Generated Suggestion
                    </span>
                    <div className="flex items-center gap-2">
                      <button 
                        type="button" 
                        onClick={() => setDismissed(true)} 
                        className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer px-2 py-1"
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
                          className="px-3 py-1 rounded-lg text-xs font-semibold bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
                        >
                          Use suggestion
                        </button>
                      )}
                    </div>
                  </div>

                  {suggestion.status === 'needs_clarification' && suggestion.clarification && (
                    <p className="text-[13px] text-amber-500 font-medium">
                      {suggestion.clarification}
                    </p>
                  )}

                  {suggestion.status === 'ready' && (
                    <div className="text-[13px] text-[var(--text-primary)] space-y-1">
                      {suggestion.category && (
                        <div>Category: <span className="font-semibold">{suggestion.category}</span></div>
                      )}
                      {suggestion.description && (
                        <p className="leading-relaxed opacity-90">{suggestion.description}</p>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Section 5: Logo / Photo Branding */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-7 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
              <h2 className="text-[17px] font-semibold text-[var(--text-primary)] font-[Satoshi] flex items-center gap-2.5">
                <span className="text-[12px] font-mono px-2 py-0.5 rounded-md bg-[var(--surface-soft)] text-[var(--text-secondary)] border border-[var(--border)]">
                  05
                </span>
                Logo or Photo
              </h2>
              <span className="text-xs text-[var(--text-muted)] font-mono">Avatar & Icon</span>
            </div>

            {currentLogoUrl ? (
              <div className="flex items-center gap-4 p-4 bg-[var(--surface-soft)] rounded-xl border border-[var(--border)]">
                <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--surface)] shrink-0 shadow-xs">
                  <img
                    src={currentLogoUrl}
                    alt="Space Logo"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                    {currentLogoUrl.startsWith('data:') ? 'Uploaded custom photo' : 'Remote image asset'}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                    Displays on public header and metadata cards
                  </div>
                  <div className="flex items-center gap-3 mt-2.5">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)] hover:underline cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-[var(--accent-ink)]" /> Replace photo
                    </button>
                    <button
                      type="button"
                      onClick={() => form.setValue('logo_url', '', { shouldDirty: true })}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div 
                onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                  isDraggingFile 
                    ? 'border-[var(--accent)] bg-[var(--surface-soft)]' 
                    : 'border-[var(--border)] hover:border-[var(--text-secondary)] bg-[var(--surface-soft)]/50 hover:bg-[var(--surface-soft)]'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--accent-ink)] shadow-xs">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                    Click to upload or drag image here
                  </span>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    Supports PNG, JPG, WebP, SVG up to 5MB
                  </p>
                </div>
              </div>
            )}

            {/* Toggle Image URL Input */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowLogoUrlInput(!showLogoUrlInput)}
                className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <LinkIcon className="w-3.5 h-3.5" />
                {showLogoUrlInput ? 'Hide image URL input' : 'Or paste an image URL instead'}
              </button>

              {showLogoUrlInput && (
                <div className="mt-2.5">
                  <input
                    type="text"
                    {...form.register('logo_url')}
                    placeholder="https://example.com/logo.png"
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--surface-soft)] border border-[var(--border)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)] font-[Instrument_Sans]"
                  />
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
              className="hidden"
            />
          </section>

        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: REAL-TIME LIVE SPACE CARD PREVIEW (5 of 12 cols)            */}
        {/* ========================================================================= */}
        <div className="lg:col-span-5 sticky top-6 space-y-4">
          
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-[var(--accent-ink)]" />
              <span className="text-[13px] font-semibold text-[var(--text-primary)] font-[Satoshi]">
                Live Public Preview
              </span>
            </div>
            <span className="text-[11px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
              Real-time
            </span>
          </div>

          {/* Interactive Card Container */}
          <div className="relative rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xl overflow-hidden transition-all duration-300">
            
            {/* Ambient Accent Mesh Header */}
            <div className="h-28 bg-gradient-to-r from-[var(--surface-soft)] via-[var(--surface)] to-[var(--surface-soft)] relative border-b border-[var(--border)] overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-[var(--accent-solid)]/15 via-transparent to-cyan-500/10 pointer-events-none" />
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                {isLive ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 shadow-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Live
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[var(--surface)]/80 text-[var(--text-secondary)] border border-[var(--border)] backdrop-blur-xs">
                    <span className="w-1.5 h-1.5 rounded-full border border-current" />
                    Private
                  </span>
                )}
              </div>
            </div>

            {/* Avatar & Title Overhang */}
            <div className="px-6 pb-6 pt-0 relative">
              <div className="-mt-12 mb-3.5 flex items-end justify-between">
                <div className="w-20 h-20 rounded-2xl border-4 border-[var(--surface)] bg-[var(--surface-soft)] overflow-hidden shadow-md flex items-center justify-center shrink-0">
                  {currentLogoUrl ? (
                    <img 
                      src={currentLogoUrl} 
                      alt="Space Logo" 
                      className="w-full h-full object-cover" 
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-[Satoshi] font-bold text-2xl bg-gradient-to-br from-[var(--accent-solid)] to-amber-400 text-[var(--accent-on-solid)]">
                      {(currentDisplayName || 'S').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="mb-1 text-right">
                  <div className="inline-flex items-center gap-1 text-[12px] font-mono text-[var(--text-secondary)] bg-[var(--surface-soft)] px-2.5 py-1 rounded-lg border border-[var(--border)]">
                    yullo.com/{slug || 'spacex'}
                  </div>
                </div>
              </div>

              {/* Space Name & Badges */}
              <div className="space-y-1.5">
                <h3 className="text-[22px] font-[Satoshi] font-bold text-[var(--text-primary)] tracking-tight leading-snug">
                  {currentDisplayName || 'Space Name'}
                </h3>
                
                {/* Metadata Pills */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[var(--surface-soft)] text-[var(--text-secondary)] border border-[var(--border)]">
                    <currentPurposeObj.icon className="w-3 h-3 text-[var(--accent-ink)]" />
                    {currentPurposeObj.shortTitle}
                  </span>

                  {currentCategory && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[var(--surface-soft)] text-[var(--text-secondary)] border border-[var(--border)]">
                      {currentCategory}
                    </span>
                  )}

                  {presenceLabel && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[var(--surface-soft)] text-[var(--text-secondary)] border border-[var(--border)]">
                      <MapPin className="w-3 h-3 text-[var(--text-muted)]" />
                      {presenceLabel}
                    </span>
                  )}
                </div>
              </div>

              {/* Bio Excerpt */}
              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed line-clamp-3">
                  {currentDescription || (
                    <span className="italic text-[var(--text-muted)]">
                      No description yet. Use "Suggest with Aura" or write a short bio to describe this Space.
                    </span>
                  )}
                </p>
              </div>

              {/* Official Website Link */}
              {currentWebsite && (
                <div className="mt-3.5 pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Website</span>
                  <a
                    href={currentWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[var(--accent-ink)] hover:underline inline-flex items-center gap-1"
                  >
                    <Globe className="w-3 h-3" />
                    {currentWebsite.replace(/^https?:\/\//i, '').replace(/\/$/, '')}
                    <ArrowRight className="w-3 h-3 -rotate-45" />
                  </a>
                </div>
              )}

              {/* Mock AI Conversation Prompt */}
              <div className="mt-5 p-3.5 rounded-xl bg-[var(--surface-soft)] border border-[var(--border)] flex items-center justify-between gap-2 shadow-2xs">
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] truncate">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--accent-ink)] shrink-0" />
                  <span className="truncate">Ask Aura anything about {currentDisplayName || 'this Space'}...</span>
                </div>
                <div className="w-6 h-6 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] shrink-0">
                  <ArrowRight className="w-3 h-3" />
                </div>
              </div>

            </div>

            {/* Subtle Footer Note */}
            <div className="px-6 py-2.5 bg-[var(--surface-soft)]/50 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
              <span>Public Space Card</span>
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Grounded with Aura
              </span>
            </div>

          </div>

          <div className="p-3.5 rounded-xl bg-[var(--surface-soft)]/50 border border-[var(--border)] text-xs text-[var(--text-secondary)] leading-relaxed">
            💡 <strong>Tip:</strong> Changes you make to the Space Name, category, and bio will immediately reflect on your public Yullo Link once saved.
          </div>

        </div>

      </div>

    </form>
  );
}
