import React, { useState, useRef } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { yulloOnboardingApi, AboutSuggestionResponse } from '../../api/onboarding';
import { 
  Bot, Upload, Trash2, Globe, Link as LinkIcon,
  User as UserIcon, Briefcase, Building, Check, Pencil,
  Loader2, ArrowRight, Eye, ShieldCheck, MapPin, AlertCircle,
  MessageSquare, Send, X
} from 'lucide-react';
import { SourceItem } from '../../components/SourceUnderstandingCard';
import { CategoryCombobox } from '../core/CategoryCombobox';
import { ColouredIcon, getBrandIconFromUrl } from '../../components/ColouredIcon';
import { getBaseDomain } from '../../config';

/**
 * Validates whether the given value is a legitimate website URL.
 * Allows empty/null (optional field), bare domains like 'spacex.com' or 'www.spacex.com',
 * full URLs like 'https://spacex.com', and localhost.
 * Disallows unsafe schemes, credentials, spaces, and strings without a valid domain structure.
 */
export function isValidWebsiteUrl(val?: string | null): boolean {
  const trimmed = (val || '').trim();
  if (!trimmed) return true;

  if (/^(javascript|data|file|ftp):/i.test(trimmed)) return false;

  let testUrl = trimmed;
  if (!/^https?:\/\//i.test(testUrl)) {
    testUrl = `https://${testUrl}`;
  }

  try {
    const parsed = new URL(testUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (!parsed.hostname || parsed.username || parsed.password) return false;

    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost') return true;

    const domainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;
    return domainRegex.test(hostname);
  } catch {
    return false;
  }
}

/**
 * Normalizes website input. If a valid domain like 'spacex.com' is entered without protocol,
 * auto-prepends 'https://'. If invalid or empty, keeps it trimmed.
 */
export function normalizeWebsiteUrl(val: string): string {
  const trimmed = val.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  if (/^[a-zA-Z0-9][-a-zA-Z0-9]*(\.[a-zA-Z0-9][-a-zA-Z0-9]*)+/i.test(trimmed) || /^localhost(:[0-9]+)?/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

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
  website: z
    .string()
    .trim()
    .refine((val) => isValidWebsiteUrl(val), {
      message: 'Please enter a valid website address (e.g. https://spacex.com or spacex.com)',
    })
    .optional()
    .nullable()
    .or(z.literal('')),
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

const POPULAR_PLATFORMS = [
  { name: 'Amazon', icon: 'amazon', domain: 'amazon.in', placeholder: 'https://amazon.in' },
  { name: 'YouTube', icon: 'youtube', domain: 'youtube.com', placeholder: 'https://youtube.com/@' },
  { name: 'Instagram', icon: 'instagram', domain: 'instagram.com', placeholder: 'https://instagram.com/' },
  { name: 'X / Twitter', icon: 'x', domain: 'x.com', placeholder: 'https://x.com/' },
  { name: 'LinkedIn', icon: 'linkedin', domain: 'linkedin.com', placeholder: 'https://linkedin.com/company/' },
  { name: 'Spotify', icon: 'spotify', domain: 'spotify.com', placeholder: 'https://open.spotify.com/' },
  { name: 'GitHub', icon: 'github', domain: 'github.com', placeholder: 'https://github.com/' },
  { name: 'Stripe', icon: 'stripe', domain: 'stripe.com', placeholder: 'https://stripe.com' },
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

interface IdentityChatMessage {
  role: 'aura' | 'user';
  text: string;
  category?: string;
  description?: string;
  website?: string;
}

  // Conversational back-and-forth chat state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<IdentityChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatSending, setIsChatSending] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

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
        website: currentWebsite || undefined,
      });
      setSuggestion(res);
      setDismissed(false);

      const initialText = res.clarification || (res.status === 'ready' 
        ? "I've generated a draft identity for your space. How does this look?" 
        : "I found information for your space. Please confirm or provide details.");

      setChatMessages([
        {
          role: 'aura',
          text: initialText,
          category: res.category || res.candidate_match?.candidate_category || undefined,
          description: res.description || res.candidate_match?.candidate_description || undefined,
          website: res.candidate_match?.url || currentWebsite || undefined,
        }
      ]);

      if (res.status === 'ready') {
        if (res.description && form.getValues('description_source') !== 'owner') {
          form.setValue('description', res.description, { shouldDirty: true });
          form.setValue('description_source', 'aura', { shouldDirty: true });
        }
        if (res.category && form.getValues('category_source') !== 'owner') {
          form.setValue('category', res.category, { shouldDirty: true });
          form.setValue('category_source', 'aura', { shouldDirty: true });
        }
        if (res.candidate_match?.url && !form.getValues('website')) {
          form.setValue('website', res.candidate_match.url, { shouldDirty: true, shouldValidate: true });
        }
      }
    } catch (e) {
      console.warn('Failed to fetch Aura identity suggestion:', e);
      setSuggestion({ status: 'unavailable', clarification: 'AI suggestion is currently unavailable. Please enter details manually.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendChatMessage = async (msgText?: string) => {
    const textToSend = (msgText ?? chatInput).trim();
    if (!textToSend || isChatSending) return;

    const userTurn: IdentityChatMessage = { role: 'user', text: textToSend };
    const updatedMessages: IdentityChatMessage[] = [...chatMessages, userTurn];
    setChatMessages(updatedMessages);
    setChatInput('');
    setIsChatSending(true);

    setTimeout(() => {
      chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);

    try {
      const history = chatMessages.map(m => ({
        role: m.role === 'aura' ? ('assistant' as const) : ('user' as const),
        content: m.text + (m.description ? `\nSuggested description: ${m.description}` : '') + (m.category ? `\nSuggested category: ${m.category}` : '')
      }));

      const res = await yulloOnboardingApi.generateSummary({
        spaceId: spaceId,
        name: currentDisplayName || 'Space',
        website: currentWebsite || undefined,
        history,
        user_message: textToSend,
      });


      setSuggestion(res);

      setChatMessages(prev => [
        ...prev,
        {
          role: 'aura',
          text: res.clarification || (res.status === 'ready' ? "I've updated your identity suggestion based on your feedback. How does this look?" : "I need a bit more detail to finalize your space identity."),
          category: res.category || res.candidate_match?.candidate_category || undefined,
          description: res.description || res.candidate_match?.candidate_description || undefined,
          website: res.candidate_match?.url || (textToSend.match(/https?:\/\/[^\s)]+/)?.[0] || currentWebsite || undefined),
        }
      ]);

      setTimeout(() => {
        chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 50);
    } catch (e) {
      console.warn('Failed to send Aura chat follow-up:', e);
      setChatMessages(prev => [
        ...prev,
        {
          role: 'aura',
          text: "I encountered an issue processing that. Please try again or enter details manually.",
        }
      ]);
    } finally {
      setIsChatSending(false);
    }
  };

  const handleApplyChatProposal = (desc?: string, cat?: string, web?: string) => {
    if (desc) {
      form.setValue('description', desc, { shouldDirty: true });
      form.setValue('description_source', 'aura', { shouldDirty: true });
    }
    if (cat) {
      form.setValue('category', cat, { shouldDirty: true });
      form.setValue('category_source', 'aura', { shouldDirty: true });
    }
    if (web) {
      form.setValue('website', web, { shouldDirty: true, shouldValidate: true });
    }
    setIsChatOpen(false);
    setDismissed(true);
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

  const handleFormSubmit = (data: IdentityFormValues) => {
    const normalizedData = {
      ...data,
      website: data.website ? normalizeWebsiteUrl(data.website) : data.website,
    };
    onSubmit(normalizedData);
  };

  const currentPurposeObj = PURPOSES.find(p => p.id === currentPurpose) || PURPOSES[0];
  const presenceLabel = PRESENCE_OPTIONS.find(p => p.value === currentPresence)?.label;
  const currentBrand = getBrandIconFromUrl(currentWebsite);

  return (
    <form id="identity-form" onSubmit={form.handleSubmit(handleFormSubmit)} className="w-full flex flex-col font-[Instrument_Sans]">
      
      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
        
        {/* ========================================================================= */}
        {/* LEFT COLUMN: COHESIVE FORM SURFACE (7 of 12 cols on desktop)              */}
        {/* ========================================================================= */}
        <div className="lg:col-span-7 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xs divide-y divide-[var(--border)] overflow-hidden">

          {/* Section 1: General Identity */}
          <section className="p-6 sm:p-7 space-y-5">
            <div>
              <h2 className="text-[16px] font-semibold text-[var(--text-primary)] font-[Satoshi] tracking-tight">
                General Identity
              </h2>
              <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
                The name of your space and its permanent public address.
              </p>
            </div>

            {/* Space Name */}
            <div>
              <label className="block text-[13px] font-semibold text-[var(--text-primary)] mb-2">
                Space Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  {...form.register('display_name')}
                  placeholder="e.g. Amazon India or Acme Studio"
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--surface-soft)] border border-[var(--border)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:ring-2 focus:ring-[var(--focus-soft)] transition-all font-[Instrument_Sans]"
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
              <label className="block text-[13px] font-semibold text-[var(--text-primary)] mb-2">
                Public Yullo Address
              </label>
              <div className="flex items-center justify-between gap-3 p-3 bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl">
                <div className="flex items-center min-w-0 font-mono text-[14px] truncate">
                  <span className="text-[var(--text-muted)] select-none">{getBaseDomain()}/</span>
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
              <p className="text-xs text-[var(--text-muted)] mt-1.5">
                Visitors use this unique address to access your public Space and talk to Aura.
              </p>
            </div>
          </section>

          {/* Section 2: Space Purpose */}
          <section className="p-6 sm:p-7 space-y-4">
            <div>
              <h2 className="text-[16px] font-semibold text-[var(--text-primary)] font-[Satoshi] tracking-tight">
                Space Purpose
              </h2>
              <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
                Defines who this space represents and fine-tunes Aura's voice and tone.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {PURPOSES.map((p) => {
                const Icon = p.icon;
                const isSelected = currentPurpose === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => form.setValue('purpose', p.id as any, { shouldDirty: true })}
                    className={`relative p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[88px] group ${
                      isSelected 
                        ? 'border-[var(--accent)] bg-[var(--surface-soft)] shadow-2xs ring-1 ring-[var(--accent)]' 
                        : 'border-[var(--border)] hover:border-[var(--text-secondary)]/50 bg-[var(--surface)]/50 hover:bg-[var(--surface-soft)]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                        isSelected 
                          ? 'bg-[var(--accent-solid)] text-[var(--accent-on-solid)]' 
                          : 'bg-[var(--surface-soft)] text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
                      }`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      {isSelected && (
                        <div className="w-3.5 h-3.5 rounded-full bg-[var(--accent-solid)] text-[var(--accent-on-solid)] flex items-center justify-center">
                          <Check className="w-2 h-2 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold leading-tight text-[var(--text-primary)]">
                        {p.shortTitle}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-1 leading-normal">
                        {p.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section 3: Classification & Online Presence (with Coloured Icons) */}
          <section className="p-6 sm:p-7 space-y-5">
            <div>
              <h2 className="text-[16px] font-semibold text-[var(--text-primary)] font-[Satoshi] tracking-tight">
                Online Presence & Classification
              </h2>
              <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
                Categorization, presence type, and official brand/channel links.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Category */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="category-combobox-input" className="text-[13px] font-semibold text-[var(--text-primary)]">
                    Category
                  </label>
                  {categorySource === 'aura' && (
                    <span className="text-[11px] font-semibold text-[var(--accent-ink)] flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" /> Aura suggestion
                    </span>
                  )}
                </div>
                <CategoryCombobox
                  id="category-combobox-input"
                  value={currentCategory || ''}
                  purpose={currentPurpose}
                  onChange={(val) => {
                    form.setValue('category', val, { shouldDirty: true });
                    form.setValue('category_source', 'owner', { shouldDirty: true });
                  }}
                  placeholder="e.g. E-commerce platform or Space company"
                />
                {form.formState.errors.category && (
                  <p className="mt-1.5 text-xs text-rose-500 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {form.formState.errors.category.message}
                  </p>
                )}
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

            {/* Official Website & Social Links (Coloured Icons Powered) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label htmlFor="official-website-input" className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <span>Official Website or Channel</span>
                  {currentBrand && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--surface-soft)] border border-[var(--border)] text-[var(--text-secondary)]">
                      <ColouredIcon name={currentBrand} className="w-3 h-3" />
                      <span className="capitalize">{currentBrand}</span>
                    </span>
                  )}
                </label>
                {currentWebsite && isValidWebsiteUrl(currentWebsite) && (
                  <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 animate-in fade-in duration-150">
                    <Check className="w-3 h-3 stroke-[2.5]" /> Validated link
                  </span>
                )}
              </div>

              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 pointer-events-none">
                  {currentBrand ? (
                    <ColouredIcon name={currentBrand} className="w-4 h-4" />
                  ) : (
                    <Globe className="w-4 h-4 text-[var(--text-muted)]" />
                  )}
                </div>
                <input
                  id="official-website-input"
                  type="text"
                  {...form.register('website', {
                    onChange: () => {
                      if (form.formState.errors.website) {
                        form.trigger('website');
                      }
                    },
                    onBlur: (e) => {
                      const raw = e.target.value.trim();
                      if (!raw) {
                        form.setValue('website', '', { shouldDirty: true, shouldValidate: true });
                        return;
                      }
                      const normalized = normalizeWebsiteUrl(raw);
                      form.setValue('website', normalized, { shouldDirty: true, shouldValidate: true });
                    }
                  })}
                  placeholder="https://amazon.in, youtube.com/@channel, or custom domain"
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-all font-[Instrument_Sans] ${
                    form.formState.errors.website
                      ? 'border-rose-500 bg-rose-500/5 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                      : 'border-[var(--border)] bg-[var(--surface-soft)] focus:border-[var(--accent)] focus:bg-[var(--surface)]'
                  }`}
                />
              </div>

              {form.formState.errors.website && (
                <p className="text-xs text-rose-500 font-medium flex items-center gap-1 animate-in fade-in slide-in-from-top-1 duration-150" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {form.formState.errors.website.message}
                </p>
              )}

              {/* Quick Platform Suggestion Chips with Coloured Icons */}
              <div className="pt-1">
                <div className="text-[11px] font-medium text-[var(--text-muted)] mb-1.5 flex items-center gap-1">
                  <span>Quick-connect platform:</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {POPULAR_PLATFORMS.map((platform) => {
                    const isCurrent = currentBrand === platform.icon;
                    return (
                      <button
                        key={platform.icon}
                        type="button"
                        onClick={() => {
                          const existing = (form.getValues('website') || '').trim();
                          if (!existing || !existing.toLowerCase().includes(platform.domain)) {
                            form.setValue('website', platform.placeholder, { shouldDirty: true, shouldValidate: true });
                          }
                          const el = document.getElementById('official-website-input');
                          if (el) el.focus();
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                          isCurrent
                            ? 'bg-[var(--surface-soft)] border-[var(--accent)] text-[var(--text-primary)] ring-1 ring-[var(--accent)]/50'
                            : 'bg-[var(--surface-soft)]/60 hover:bg-[var(--surface-soft)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        <ColouredIcon name={platform.icon} className="w-3.5 h-3.5" />
                        <span>{platform.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Section 4: About Description */}
          <section className="p-6 sm:p-7 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[16px] font-semibold text-[var(--text-primary)] font-[Satoshi] tracking-tight">
                  About this Space
                </h2>
                <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
                  A concise summary explaining what this space does and what visitors can explore.
                </p>
              </div>

              {/* Suggest with Aura Pill Button */}
              <button
                type="button"
                onClick={fetchAuraSuggestion}
                disabled={isGenerating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[var(--surface-soft)] hover:bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--accent)] shadow-2xs transition-all cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isGenerating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-ink)]" />
                ) : (
                  <Bot className="w-3.5 h-3.5 text-[var(--accent-ink)]" />
                )}
                <span>{isGenerating ? 'Generating...' : 'Suggest with Aura'}</span>
              </button>
            </div>

            <div className="relative">
              <textarea
                {...form.register('description', {
                  onChange: () => form.setValue('description_source', 'owner', { shouldDirty: true })
                })}
                rows={4}
                maxLength={280}
                placeholder="Amazon India is an online marketplace offering millions of products across electronics, fashion, home essentials, and books with reliable doorstep delivery..."
                className="w-full p-3.5 rounded-xl bg-[var(--surface-soft)] border border-[var(--border)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)] transition-all font-[Instrument_Sans] resize-none leading-relaxed"
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
                      <Bot className="w-3.5 h-3.5" /> {suggestion.status === 'ready' ? 'Aura Generated Suggestion' : 'Aura Note'}
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
                      <button 
                        type="button" 
                        onClick={() => {
                          if (chatMessages.length === 0 && (suggestion.clarification || suggestion.candidate_match || suggestion.description)) {
                            setChatMessages([
                              {
                                role: 'aura',
                                text: suggestion.clarification || (suggestion.status === 'ready' ? "I've generated a draft identity for your space. How does this look?" : "I found information for your space. Please confirm or provide details."),
                                category: suggestion.category || suggestion.candidate_match?.candidate_category || undefined,
                                description: suggestion.description || suggestion.candidate_match?.candidate_description || undefined,
                                website: suggestion.candidate_match?.url || currentWebsite || undefined,
                              }
                            ]);
                          }
                          setIsChatOpen(true);
                        }}
                        className="px-3 py-1 rounded-lg text-xs font-semibold bg-[var(--surface-soft)] hover:bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--accent)] transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-[var(--accent-ink)]" />
                        <span>Chat with Aura</span>
                      </button>
                      {suggestion.status === 'needs_clarification' && (
                        <button 
                          type="button" 
                          onClick={() => {
                            const matchUrl = suggestion.candidate_match?.url || suggestion.clarification?.match(/\((https?:\/\/[^\s)]+)\)/i)?.[1] || suggestion.clarification?.match(/https?:\/\/[^\s)]+/)?.[0];
                            const candidateDesc = suggestion.candidate_match?.candidate_description;
                            const candidateCat = suggestion.candidate_match?.candidate_category;

                            if (matchUrl) {
                              form.setValue('website', matchUrl, { shouldDirty: true, shouldValidate: true });
                            }
                            if (candidateDesc) {
                              form.setValue('description', candidateDesc, { shouldDirty: true }); 
                              form.setValue('description_source', 'aura', { shouldDirty: true });
                            }
                            if (candidateCat) {
                              form.setValue('category', candidateCat, { shouldDirty: true }); 
                              form.setValue('category_source', 'aura', { shouldDirty: true });
                            }
                            setDismissed(true);
                            if (matchUrl && !candidateDesc) {
                              fetchAuraSuggestion();
                            }
                          }} 
                          className="px-3 py-1 rounded-lg text-xs font-semibold bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
                        >
                          Confirm & Add
                        </button>
                      )}
                    </div>
                  </div>

                  {(suggestion.status === 'needs_clarification' || suggestion.status === 'insufficient_context') && suggestion.clarification && (
                    <p className="text-[13px] text-amber-500 font-medium leading-relaxed">
                      {suggestion.clarification}
                    </p>
                  )}

                  {suggestion.status === 'needs_clarification' && (suggestion.candidate_match?.candidate_description || suggestion.candidate_match?.candidate_category) && (
                    <div className="text-[13px] text-[var(--text-primary)] space-y-1 pt-1.5 border-t border-[var(--border)]">
                      {suggestion.candidate_match?.candidate_category && (
                        <div>Suggested Category: <span className="font-semibold">{suggestion.candidate_match.candidate_category}</span></div>
                      )}
                      {suggestion.candidate_match?.candidate_description && (
                        <p className="leading-relaxed opacity-90">{suggestion.candidate_match.candidate_description}</p>
                      )}
                    </div>
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
          <section className="p-6 sm:p-7 space-y-4">
            <div>
              <h2 className="text-[16px] font-semibold text-[var(--text-primary)] font-[Satoshi] tracking-tight">
                Logo or Photo
              </h2>
              <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
                Displays on the public space header and social cards.
              </p>
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
                    {getBaseDomain()}/{slug || 'spacex'}
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

              {/* Official Website Link with Coloured Icon */}
              {currentWebsite && isValidWebsiteUrl(currentWebsite) && (
                <div className="mt-4 pt-3.5 border-t border-[var(--border)] flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Official Platform</span>
                  <a
                    href={currentWebsite.startsWith('http') ? currentWebsite : `https://${currentWebsite}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[var(--accent-ink)] hover:underline inline-flex items-center gap-1.5"
                  >
                    {currentBrand ? (
                      <ColouredIcon name={currentBrand} className="w-3.5 h-3.5" />
                    ) : (
                      <Globe className="w-3.5 h-3.5" />
                    )}
                    <span>{currentWebsite.replace(/^https?:\/\//i, '').replace(/\/$/, '')}</span>
                    <ArrowRight className="w-3 h-3 -rotate-45" />
                  </a>
                </div>
              )}

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

      {/* Interactive Conversational Aura Identity Modal */}
      <AnimatePresence>
        {isChatOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-[Instrument_Sans]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={transition}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden text-[var(--text-primary)]"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-soft)]">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-[var(--accent)]/15 text-[var(--accent-ink)]">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-[Satoshi] font-semibold text-[16px] text-[var(--text-primary)] leading-tight">
                      Aura Identity Assistant
                    </h3>
                    <p className="text-[12px] text-[var(--text-secondary)]">
                      Conversational back-and-forth refinement for {currentDisplayName || 'your space'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsChatOpen(false)}
                  className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Chat Message Stream */}
              <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-5 space-y-4 min-h-[260px] max-h-[50vh]">
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} gap-1.5`}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--text-muted)] px-1">
                      {msg.role === 'aura' ? (
                        <span className="flex items-center gap-1 text-[var(--accent-ink)] font-semibold">
                          <Bot className="w-3 h-3" /> Aura
                        </span>
                      ) : (
                        <span>You</span>
                      )}
                    </div>
                    <div
                      className={`max-w-[90%] p-3.5 rounded-2xl text-[13px] leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-[var(--accent-solid)] text-[var(--accent-on-solid)] rounded-br-xs font-medium'
                          : 'bg-[var(--surface-soft)] border border-[var(--border)] text-[var(--text-primary)] rounded-bl-xs'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                      
                      {/* Attached proposal card inside Aura's message bubble */}
                      {msg.role === 'aura' && (msg.description || msg.category || msg.website) && (
                        <div className="mt-2.5 pt-2.5 border-t border-[var(--border)] text-xs space-y-1.5 bg-[var(--surface)]/70 p-3 rounded-xl">
                          {msg.category && (
                            <div>
                              <span className="text-[var(--text-muted)] font-medium">Category: </span>
                              <span className="font-semibold text-[var(--text-primary)]">{msg.category}</span>
                            </div>
                          )}
                          {msg.description && (
                            <div>
                              <span className="text-[var(--text-muted)] font-medium">About: </span>
                              <span className="text-[var(--text-primary)]">{msg.description}</span>
                            </div>
                          )}
                          {msg.website && (
                            <div className="flex items-center gap-1 text-[var(--text-muted)]">
                              <span>Website: </span>
                              <span className="font-mono text-[var(--accent-ink)] truncate">{msg.website}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isChatSending && (
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] py-2 px-1 animate-pulse">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-ink)]" />
                    <span>Aura is refining identity based on your feedback...</span>
                  </div>
                )}
              </div>

              {/* Quick suggestion chips */}
              <div className="px-5 py-2.5 border-t border-[var(--border)] bg-[var(--surface-soft)]/50 flex flex-wrap gap-1.5">
                {[
                  "Yes, this is my space",
                  "Make description shorter",
                  "Focus on products and online shopping",
                  "Change category"
                ].map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendChatMessage(chip)}
                    disabled={isChatSending}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer disabled:opacity-50"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Input Area */}
              <div className="p-3.5 border-t border-[var(--border)] bg-[var(--surface)] flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSendChatMessage();
                    }
                  }}
                  placeholder="Type a response, website URL, or request revisions..."
                  disabled={isChatSending}
                  className="flex-1 px-4 py-2.5 text-[13px] bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl outline-none focus:border-[var(--accent)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                />
                <button
                  type="button"
                  onClick={() => handleSendChatMessage()}
                  disabled={!chatInput.trim() || isChatSending}
                  className="p-2.5 rounded-xl bg-[var(--accent-solid)] text-[var(--accent-on-solid)] disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer shrink-0"
                  aria-label="Send"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Footer with Apply action */}
              <div className="px-6 py-3 border-t border-[var(--border)] bg-[var(--surface-soft)] flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">
                  Apply current proposal to the form fields.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsChatOpen(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const latestAura = [...chatMessages].reverse().find(m => m.role === 'aura' && (m.description || m.category || m.website));
                      handleApplyChatProposal(
                        latestAura?.description || suggestion?.description || suggestion?.candidate_match?.candidate_description,
                        latestAura?.category || suggestion?.category || suggestion?.candidate_match?.candidate_category,
                        latestAura?.website || suggestion?.candidate_match?.url
                      );
                    }}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 transition-opacity cursor-pointer shadow-xs flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Apply to Space</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </form>
  );
}
