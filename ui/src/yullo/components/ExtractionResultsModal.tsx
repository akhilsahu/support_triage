import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, CheckCircle2, Sparkles, Globe, FileText, ExternalLink, Download, 
  Image as ImageIcon, Link as LinkIcon, Quote, Layers, CheckCheck, 
  SlidersHorizontal, ChevronRight, Eye
} from 'lucide-react';
import type { SourceItem } from './SourceUnderstandingCard';
import type { SourceFact } from '../api/onboarding';
import type { SourceEntity } from '../api/entities';
import { yulloOnboardingApi } from '../api/onboarding';
import { entitiesApi } from '../api/entities';

interface ExtractionResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  source: SourceItem | null;
  spaceId: string;
  onOpenReviewSheet?: () => void;
}

export type ExtractionTab = 'connected-assets' | 'facts' | 'entities';

export const ExtractionResultsModal: React.FC<ExtractionResultsModalProps> = ({
  isOpen,
  onClose,
  source,
  spaceId,
  onOpenReviewSheet,
}) => {
  const [currentSource, setCurrentSource] = useState<SourceItem | null>(source);
  const [activeTab, setActiveTab] = useState<ExtractionTab>('connected-assets');
  const [facts, setFacts] = useState<SourceFact[]>([]);
  const [entities, setEntities] = useState<SourceEntity[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => {
    setCurrentSource(source);
  }, [source]);

  useEffect(() => {
    if (!isOpen || !source?.id || !spaceId) return;

    let isMounted = true;
    setIsLoadingDetails(true);

    Promise.all([
      yulloOnboardingApi.getSource(source.id).catch(() => null),
      yulloOnboardingApi.getSourceFacts(spaceId, source.id).catch(() => []),
      entitiesApi.listSourceEntities(spaceId, source.id).catch(() => []),
    ]).then(([freshSource, fetchedFacts, fetchedEntities]) => {
      if (isMounted) {
        if (freshSource) {
          setCurrentSource(freshSource);
        }
        setFacts(fetchedFacts);
        setEntities(fetchedEntities);
        setIsLoadingDetails(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, source?.id, spaceId]);

  if (!isOpen || !source) return null;

  const activeSource = currentSource || source;
  const rawTitle = activeSource.title || activeSource.content_ref || 'Source';
  const displayTitle = (rawTitle.includes('/') ? rawTitle.split('/').pop() || rawTitle : rawTitle)
    .replace(/^file_[a-f0-9]+_/i, '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');

  const assets = activeSource.assets;
  const images = assets?.images || [];
  const documents = assets?.documents || [];
  const links = (assets as any)?.links || [];
  const totalAssetsCount = images.length + documents.length + links.length;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-[4px] animate-in fade-in duration-200 font-[Instrument_Sans]">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal Dialog Window */}
      <div 
        className="relative flex flex-col w-full max-w-4xl max-h-[90vh] bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl z-10 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <div className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] px-6 py-5 sm:px-8 sm:py-6 z-20 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[12px] font-semibold bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Extraction Complete
                </span>
                <span className="text-[12px] text-[var(--text-muted)] font-mono">
                  Ready for Aura
                </span>
              </div>

              <div className="flex items-center gap-3">
                {activeSource.source_type === 'url' && activeSource.favicon_url ? (
                  <div className="w-7 h-7 rounded-lg bg-[var(--surface-soft)] border border-[var(--border)] flex items-center justify-center shrink-0 overflow-hidden">
                    <img 
                      src={activeSource.favicon_url} 
                      alt="" 
                      className="w-4 h-4 object-contain rounded-xs" 
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-[var(--surface-soft)] border border-[var(--border)] flex items-center justify-center shrink-0">
                    <Globe className="w-4 h-4 text-cyan-600" />
                  </div>
                )}
                <h2 className="font-[Satoshi] text-[20px] sm:text-[24px] font-bold text-[var(--text-primary)] tracking-tight truncate">
                  {displayTitle}
                </h2>
              </div>

              {activeSource.content_ref && activeSource.content_ref !== displayTitle && (
                <p className="text-[12px] text-[var(--text-secondary)] font-mono truncate mt-1">
                  {activeSource.content_ref}
                </p>
              )}
            </div>

            <button
              onClick={onClose}
              aria-label="Close modal"
              className="p-2 rounded-xl hover:bg-[var(--surface-soft)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0 -mr-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 mt-5 border-b border-[var(--border)] -mb-5 pb-2 overflow-x-auto scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveTab('connected-assets')}
              className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'connected-assets'
                  ? 'bg-[var(--accent-solid)] text-[var(--accent-on-solid)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-soft)]'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              Connected Media & Links
              <span className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === 'connected-assets' ? 'bg-white/20' : 'bg-[var(--surface-soft)] border border-[var(--border)]'
              }`}>
                {totalAssetsCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('facts')}
              className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'facts'
                  ? 'bg-[var(--accent-solid)] text-[var(--accent-on-solid)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-soft)]'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Detected Facts
              <span className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === 'facts' ? 'bg-white/20' : 'bg-[var(--surface-soft)] border border-[var(--border)]'
              }`}>
                {facts.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('entities')}
              className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'entities'
                  ? 'bg-[var(--accent-solid)] text-[var(--accent-on-solid)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-soft)]'
              }`}
            >
              <Layers className="w-4 h-4" />
              Structured Details
              <span className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === 'entities' ? 'bg-white/20' : 'bg-[var(--surface-soft)] border border-[var(--border)]'
              }`}>
                {entities.length}
              </span>
            </button>
          </div>
        </div>

        {/* Scrollable Body Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-8 sm:py-7 space-y-6">
          {/* Top Summary Metrics Strip for all extracted data categories */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-[12px] text-[var(--text-secondary)]">
              <span className="font-semibold uppercase tracking-wider text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
                <SlidersHorizontal className="w-3 h-3 text-[var(--accent-solid)]" /> Extraction Summary
              </span>
              <span className="font-mono text-[11px]">
                {images.length + links.length + documents.length + facts.length + entities.length} total items extracted
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {/* Images */}
              <button
                type="button"
                onClick={() => setActiveTab('connected-assets')}
                className={`p-3 rounded-xl border transition-all text-left group cursor-pointer flex flex-col justify-between ${
                  activeTab === 'connected-assets'
                    ? 'border-violet-500/50 bg-violet-500/5 dark:bg-violet-500/10 shadow-xs'
                    : 'border-[var(--border)] bg-[var(--surface-soft)]/60 hover:bg-[var(--surface-soft)] hover:border-violet-500/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] group-hover:text-[var(--text-primary)]">
                    Images
                  </span>
                  <div className="w-5 h-5 rounded-md bg-violet-500/15 flex items-center justify-center">
                    <ImageIcon className="w-3 h-3 text-violet-500" />
                  </div>
                </div>
                <div className="mt-2">
                  <span className="text-[20px] font-bold font-[Satoshi] text-[var(--text-primary)] block leading-tight">
                    {images.length}
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)]">with context</span>
                </div>
              </button>

              {/* Links */}
              <button
                type="button"
                onClick={() => setActiveTab('connected-assets')}
                className={`p-3 rounded-xl border transition-all text-left group cursor-pointer flex flex-col justify-between ${
                  activeTab === 'connected-assets'
                    ? 'border-cyan-500/50 bg-cyan-500/5 dark:bg-cyan-500/10 shadow-xs'
                    : 'border-[var(--border)] bg-[var(--surface-soft)]/60 hover:bg-[var(--surface-soft)] hover:border-cyan-500/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] group-hover:text-[var(--text-primary)]">
                    Links
                  </span>
                  <div className="w-5 h-5 rounded-md bg-cyan-500/15 flex items-center justify-center">
                    <LinkIcon className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                  </div>
                </div>
                <div className="mt-2">
                  <span className="text-[20px] font-bold font-[Satoshi] text-[var(--text-primary)] block leading-tight">
                    {links.length}
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)]">contextual</span>
                </div>
              </button>

              {/* Documents */}
              <button
                type="button"
                onClick={() => setActiveTab('connected-assets')}
                className={`p-3 rounded-xl border transition-all text-left group cursor-pointer flex flex-col justify-between ${
                  activeTab === 'connected-assets'
                    ? 'border-amber-500/50 bg-amber-500/5 dark:bg-amber-500/10 shadow-xs'
                    : 'border-[var(--border)] bg-[var(--surface-soft)]/60 hover:bg-[var(--surface-soft)] hover:border-amber-500/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] group-hover:text-[var(--text-primary)]">
                    Docs & Files
                  </span>
                  <div className="w-5 h-5 rounded-md bg-amber-500/15 flex items-center justify-center">
                    <FileText className="w-3 h-3 text-amber-500" />
                  </div>
                </div>
                <div className="mt-2">
                  <span className="text-[20px] font-bold font-[Satoshi] text-[var(--text-primary)] block leading-tight">
                    {documents.length}
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)]">downloadable</span>
                </div>
              </button>

              {/* Facts */}
              <button
                type="button"
                onClick={() => setActiveTab('facts')}
                className={`p-3 rounded-xl border transition-all text-left group cursor-pointer flex flex-col justify-between ${
                  activeTab === 'facts'
                    ? 'border-emerald-500/50 bg-emerald-500/5 dark:bg-emerald-500/10 shadow-xs'
                    : 'border-[var(--border)] bg-[var(--surface-soft)]/60 hover:bg-[var(--surface-soft)] hover:border-emerald-500/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] group-hover:text-[var(--text-primary)]">
                    Facts
                  </span>
                  <div className="w-5 h-5 rounded-md bg-emerald-500/15 flex items-center justify-center">
                    <Sparkles className="w-3 h-3 text-emerald-500" />
                  </div>
                </div>
                <div className="mt-2">
                  <span className="text-[20px] font-bold font-[Satoshi] text-[var(--text-primary)] block leading-tight">
                    {isLoadingDetails ? '...' : facts.length}
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)]">grounded</span>
                </div>
              </button>

              {/* Entities */}
              <button
                type="button"
                onClick={() => setActiveTab('entities')}
                className={`p-3 rounded-xl border transition-all text-left group cursor-pointer flex flex-col justify-between ${
                  activeTab === 'entities'
                    ? 'border-indigo-500/50 bg-indigo-500/5 dark:bg-indigo-500/10 shadow-xs'
                    : 'border-[var(--border)] bg-[var(--surface-soft)]/60 hover:bg-[var(--surface-soft)] hover:border-indigo-500/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] group-hover:text-[var(--text-primary)]">
                    Entities
                  </span>
                  <div className="w-5 h-5 rounded-md bg-indigo-500/15 flex items-center justify-center">
                    <Layers className="w-3 h-3 text-indigo-500" />
                  </div>
                </div>
                <div className="mt-2">
                  <span className="text-[20px] font-bold font-[Satoshi] text-[var(--text-primary)] block leading-tight">
                    {isLoadingDetails ? '...' : entities.length}
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)]">structured</span>
                </div>
              </button>
            </div>
          </div>

          {/* TAB 1: CONNECTED ASSETS (Images, Links, Documents with related context text) */}
          {activeTab === 'connected-assets' && (
            <div className="space-y-7">
              {/* Overview banner */}
              <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/60 text-[13px] text-[var(--text-secondary)] flex items-center justify-between">
                <span>
                  All images, downloadable files, and links extracted from this source are linked to their surrounding context in the source document.
                </span>
              </div>

              {/* Social / OpenGraph Preview Banner if available */}
              {activeSource.preview_image_url && (
                <div className="space-y-2">
                  <h4 className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-2">
                    <Globe className="w-4 h-4 text-cyan-600" />
                    Source Preview Banner & Social Graphic
                  </h4>
                  <div className="rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--surface-soft)]/40 flex flex-col sm:flex-row items-center">
                    <div className="w-full sm:w-64 h-36 shrink-0 bg-[var(--surface-soft)] overflow-hidden">
                      <img 
                        src={activeSource.preview_image_url} 
                        alt="Preview" 
                        className="w-full h-full object-cover" 
                        onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }}
                      />
                    </div>
                    <div className="p-4 flex-1 min-w-0">
                      <p className="font-[Satoshi] font-semibold text-[15px] text-[var(--text-primary)] truncate">
                        {displayTitle}
                      </p>
                      <p className="text-[13px] text-[var(--text-secondary)] mt-1 line-clamp-2">
                        {assets?.description || activeSource.preview_excerpt || 'Website preview card image.'}
                      </p>
                      <a 
                        href={activeSource.preview_image_url} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="inline-flex items-center gap-1 text-[12px] text-[var(--accent-ink)] hover:underline mt-2 font-medium"
                      >
                        Open high-res image <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Connected Images Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-violet-500" />
                    Connected Page Images ({images.length})
                  </h4>
                  <span className="text-[12px] text-[var(--text-muted)]">
                    Linked with surrounding text
                  </span>
                </div>

                {images.length === 0 ? (
                  <p className="text-[14px] text-[var(--text-secondary)] py-4 italic">
                    No content images were found on this page.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {images.map((img, idx) => (
                      <div 
                        key={idx} 
                        className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/50 p-4 flex flex-col justify-between space-y-3 hover:border-[var(--accent)] transition-colors"
                      >
                        <div className="flex gap-3.5 items-start">
                          <a 
                            href={img.url} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="w-24 h-24 rounded-lg border border-[var(--border)] overflow-hidden shrink-0 bg-[var(--surface)] group relative block"
                          >
                            <img 
                              src={img.url} 
                              alt={img.alt || 'Extracted image'} 
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" 
                              onError={(e) => {
                                (e.currentTarget.parentElement as HTMLElement).innerHTML = '<div class="p-2 text-center text-[10px] text-[var(--text-muted)] flex items-center justify-center h-full">No image</div>';
                              }}
                            />
                          </a>

                          <div className="min-w-0 flex-1">
                            {img.alt && (
                              <p className="font-semibold text-[13px] text-[var(--text-primary)] font-[Satoshi] leading-snug line-clamp-1">
                                {img.alt}
                              </p>
                            )}
                            
                            {(img as any).section && (
                              <span className="inline-block mt-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] truncate max-w-full">
                                In: {(img as any).section}
                              </span>
                            )}

                            {img.caption && (
                              <p className="text-[12px] text-[var(--text-muted)] italic mt-1.5 line-clamp-2">
                                Caption: {img.caption}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Connected Context Quote */}
                        {(img as any).context_text && (
                          <div className="p-2.5 rounded-lg bg-[var(--surface)] border-l-2 border-[var(--accent)] text-[12px] text-[var(--text-secondary)] leading-relaxed font-[Instrument_Sans]">
                            <span className="font-semibold text-[var(--text-primary)] block text-[11px] uppercase tracking-wider mb-0.5">
                              Related text:
                            </span>
                            "{(img as any).context_text}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Connected Documents & Downloadable Files */}
              <div className="space-y-3 pt-4 border-t border-[var(--border)]">
                <div className="flex items-center justify-between">
                  <h4 className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-500" />
                    Downloadable Assets & Linked Docs ({documents.length})
                  </h4>
                  <span className="text-[12px] text-[var(--text-muted)]">
                    Linked with explanatory text
                  </span>
                </div>

                {documents.length === 0 ? (
                  <p className="text-[14px] text-[var(--text-secondary)] py-2 italic">
                    No downloadable document links (PDFs, DOCX) were found on this source.
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/40 overflow-hidden">
                    {documents.map((doc, idx) => (
                      <div key={idx} className="p-4 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <FileText className="w-4 h-4 text-violet-500 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-[14px] text-[var(--text-primary)] font-[Satoshi] truncate">
                                {doc.title || doc.filename}
                              </p>
                              {(doc as any).section && (
                                <p className="text-[11px] text-[var(--text-muted)] truncate">
                                  Section: {(doc as any).section}
                                </p>
                              )}
                            </div>
                          </div>

                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors shrink-0"
                          >
                            <Download className="w-3.5 h-3.5 text-[var(--text-secondary)]" /> Open {doc.file_type.toUpperCase()}
                          </a>
                        </div>

                        {/* Connected Context */}
                        {(doc as any).context_text && (
                          <div className="p-2.5 rounded-lg bg-[var(--surface)] border-l-2 border-violet-400 text-[12px] text-[var(--text-secondary)] leading-relaxed">
                            <span className="font-semibold text-[var(--text-primary)] block text-[11px] uppercase tracking-wider mb-0.5">
                              Context in document:
                            </span>
                            "{(doc as any).context_text}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Contextual Links */}
              {links.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-[var(--border)]">
                  <h4 className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-2">
                    <LinkIcon className="w-4 h-4 text-cyan-600" />
                    Contextual Links ({links.length})
                  </h4>

                  <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/40 overflow-hidden">
                    {links.map((link: any, idx: number) => (
                      <div key={idx} className="p-3.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-[13px] text-[var(--text-primary)] truncate font-[Satoshi]">
                            {link.title}
                          </p>
                          <a 
                            href={link.url} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="text-[12px] text-[var(--accent-ink)] hover:underline inline-flex items-center gap-1 shrink-0"
                          >
                            Visit <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                        {link.context_text && (
                          <p className="text-[12px] text-[var(--text-secondary)] italic line-clamp-2">
                            "{link.context_text}"
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DETECTED FACTS & EVIDENCE GROUNDING */}
          {activeTab === 'facts' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/60 text-[13px] text-[var(--text-secondary)] flex items-center justify-between">
                <span>
                  Facts extracted by Aura's understanding pass. Each fact is strictly grounded with verbatim evidence from this source.
                </span>
              </div>

              {isLoadingDetails ? (
                <div className="py-12 text-center text-[var(--text-secondary)] text-[14px]">
                  Loading extracted facts...
                </div>
              ) : facts.length === 0 ? (
                <p className="text-[14px] text-[var(--text-secondary)] py-6 text-center italic">
                  No structured facts were extracted from this source yet.
                </p>
              ) : (
                <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/40 overflow-hidden">
                  {facts.map((fact) => (
                    <div key={fact.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[14px] text-[var(--text-primary)] leading-relaxed">
                            {fact.subject} — {fact.label}: {fact.value}
                          </p>
                          {fact.note && (
                            <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                              {fact.note}
                            </p>
                          )}
                        </div>

                        <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                          fact.review_status === 'owner_confirmed' || fact.review_status === 'source_authoritative'
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25'
                            : fact.review_status === 'rejected'
                              ? 'bg-rose-500/10 text-rose-600 border border-rose-500/25'
                              : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25'
                        }`}>
                          {fact.review_status === 'owner_confirmed' ? 'Confirmed' : fact.review_status === 'rejected' ? 'Rejected' : 'Candidate'}
                        </span>
                      </div>

                      {/* Grounded Evidence / Locator */}
                      {fact.source_locator && (
                        <div className="p-2.5 rounded-lg bg-[var(--surface)] border-l-2 border-emerald-500 text-[12px] text-[var(--text-secondary)] font-mono leading-relaxed">
                          <span className="font-sans font-semibold text-[var(--text-primary)] block text-[11px] uppercase tracking-wider mb-0.5">
                            Grounded reference:
                          </span>
                          "{fact.source_locator}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: STRUCTURED DETAILS (Entities) */}
          {activeTab === 'entities' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/60 text-[13px] text-[var(--text-secondary)] flex items-center justify-between">
                <span>
                  Structured services, offerings, team members, locations, and actions detected from this source.
                </span>
              </div>

              {isLoadingDetails ? (
                <div className="py-12 text-center text-[var(--text-secondary)] text-[14px]">
                  Loading extracted details...
                </div>
              ) : entities.length === 0 ? (
                <p className="text-[14px] text-[var(--text-secondary)] py-6 text-center italic">
                  No structured details were detected from this source.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {entities.map((entity) => (
                    <div 
                      key={entity.id} 
                      className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/50 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)]">
                            {entity.entity_type.replace('_', ' ')}
                          </span>
                          <h4 className="font-semibold text-[15px] text-[var(--text-primary)] font-[Satoshi]">
                            {entity.payload_json?.name || entity.payload_json?.title || entity.payload_json?.label || 'Detail'}
                          </h4>
                        </div>
                        <span className="text-[12px] font-mono text-[var(--text-muted)]">
                          rev {entity.revision}
                        </span>
                      </div>

                      {entity.payload_json?.description && (
                        <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                          {entity.payload_json.description}
                        </p>
                      )}

                      {/* Entity price or link if available */}
                      {entity.payload_json?.price_amount && (
                        <p className="text-[13px] font-semibold text-emerald-600">
                          {entity.payload_json.currency || '$'}{entity.payload_json.price_amount}
                        </p>
                      )}
                      {entity.payload_json?.destination_url && (
                        <a 
                          href={entity.payload_json.destination_url} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="inline-flex items-center gap-1 text-[12px] text-[var(--accent-ink)] hover:underline font-mono"
                        >
                          {entity.payload_json.destination_url} <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--surface-soft)] px-6 py-4 sm:px-8 shrink-0">
          <div className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
            <CheckCheck className="w-4 h-4 text-emerald-600" />
            <span>Extracted and indexed into Aura search</span>
          </div>

          <div className="flex items-center gap-3">
            {onOpenReviewSheet && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenReviewSheet();
                }}
                className="px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[13px] font-medium text-[var(--text-primary)] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--text-secondary)]" /> Review in Detail
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-[var(--accent-solid)] text-[var(--accent-on-solid)] text-[13px] font-semibold hover:opacity-90 transition-all cursor-pointer shadow-xs"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
