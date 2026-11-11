import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Globe, Check, Loader2, Image as ImageIcon, ExternalLink, ShieldCheck, FolderTree } from 'lucide-react';
import type { SourceItem } from './SourceUnderstandingCard';

interface LinkPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  source: SourceItem | null;
  onAddToSources: (sourceId: string) => Promise<void> | void;
}

export const LinkPreviewModal: React.FC<LinkPreviewModalProps> = ({
  isOpen,
  onClose,
  source,
  onAddToSources,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !source) return null;

  const handleAdd = async () => {
    setIsSubmitting(true);
    try {
      await onAddToSources(source.id);
      onClose();
    } catch (err) {
      console.error('Failed to add source to Aura:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const imagesCount = source.assets?.images?.length || 0;
  const docsCount = source.assets?.documents?.length || 0;
  const factsCount = source.facts?.length || 0;
  const linkCategories = source.assets?.link_categories || [];
  const linksCount = source.assets?.links?.length || 0;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 font-[Instrument_Sans]">
      <div className="absolute inset-0" onClick={onClose} />
      
      <div 
        className="relative flex flex-col w-full max-w-2xl max-h-[90vh] bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl z-10 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-4 p-5 sm:px-6 border-b border-[var(--border)] bg-[var(--surface-soft)]/50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-700 dark:text-cyan-400">
              <Globe className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-[Satoshi] text-[17px] font-semibold text-[var(--text-primary)]">
                Website Preview Generated
              </h2>
              <p className="mt-0.5 text-[12px] text-[var(--text-secondary)] truncate">
                {source.content_ref}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Main Info Card */}
          <div className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/60 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/10 overflow-hidden">
              {source.favicon_url ? (
                <img
                  src={source.favicon_url}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-6 w-6 object-contain rounded-xs"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const sibling = e.currentTarget.nextElementSibling as HTMLElement;
                    if (sibling) sibling.style.display = 'block';
                  }}
                />
              ) : null}
              <Globe
                className="h-5 w-5 text-cyan-700 dark:text-cyan-400"
                style={source.favicon_url ? { display: 'none' } : undefined}
              />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="truncate font-[Satoshi] text-[15px] font-semibold text-[var(--text-primary)]">
                {source.title || source.content_ref}
              </h4>
              <a 
                href={source.content_ref} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="inline-flex items-center gap-1 font-mono text-[12px] text-[var(--accent)] hover:underline truncate max-w-full"
              >
                {source.content_ref}
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>
            {(imagesCount > 0 || docsCount > 0) && (
              <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)]">
                {[
                  imagesCount ? `${imagesCount} images` : '',
                  docsCount ? `${docsCount} docs` : '',
                ].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>

          {/* Preview Image Banner */}
          {(source.preview_image_url || source.assets?.images?.[0]?.url) && (
            <div className="rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--surface-soft)]/40 max-h-52">
              <img
                src={source.preview_image_url || source.assets?.images?.[0]?.url}
                alt="Website preview"
                referrerPolicy="no-referrer"
                loading="lazy"
                className="w-full h-52 object-cover"
                onError={(e) => {
                  (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
                }}
              />
            </div>
          )}

          {/* Extracted Content Images Grid */}
          {Boolean(source.assets?.images?.length) && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <label className="text-[12px] font-bold uppercase tracking-wider text-[var(--text-secondary)] font-[Satoshi] flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5" /> Extracted Page Images ({source.assets!.images!.length})
                </label>
                <span className="text-[11px] text-[var(--text-secondary)] font-mono">
                  Captured for branding & knowledge
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {source.assets!.images!.slice(0, 8).map((img, idx) => (
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
                        alt={img.alt || `Extracted image ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                        onError={(e) => {
                          const parent = (e.currentTarget as HTMLElement).parentElement;
                          if (parent) {
                            parent.innerHTML = '<div class="p-2 text-center text-[10px] text-[var(--text-muted)] flex flex-col items-center justify-center h-full"><span class="opacity-50">Unavailable</span></div>';
                          }
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

          {/* Hierarchical Link Categories & Navigation */}
          {linkCategories.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[12px] font-bold uppercase tracking-wider text-[var(--text-secondary)] font-[Satoshi] flex items-center gap-1.5">
                  <FolderTree className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                  Navigation & Link Categories ({linkCategories.length})
                </label>
                <span className="text-[11px] text-[var(--text-muted)] font-mono">
                  {linksCount} links mapped
                </span>
              </div>
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {linkCategories.map((cat, catIdx) => (
                  <div
                    key={catIdx}
                    className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/50 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--accent-soft)] text-[var(--accent-ink)] border border-[var(--accent)]/20">
                          {cat.depth > 1 ? `L${cat.depth}` : 'Category'}
                        </span>
                        <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate font-[Satoshi]">
                          {cat.name}
                        </span>
                        {cat.parent && (
                          <span className="text-[11px] text-[var(--text-muted)] truncate">
                            (in {cat.parent})
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[var(--text-secondary)] font-mono shrink-0">
                        {cat.links.length} {cat.links.length === 1 ? 'link' : 'links'}
                      </span>
                    </div>
                    {cat.links && cat.links.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {cat.links.slice(0, 6).map((linkItem, lkIdx) => (
                          <a
                            key={lkIdx}
                            href={linkItem.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-[var(--surface)] hover:bg-[var(--surface-soft)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
                          >
                            <span className="truncate max-w-[140px]">{linkItem.title || 'Link'}</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-60 shrink-0" />
                          </a>
                        ))}
                        {cat.links.length > 6 && (
                          <span className="inline-flex items-center px-2 py-1 text-[11px] text-[var(--text-muted)]">
                            +{cat.links.length - 6} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scraped Content Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-[12px] font-bold uppercase tracking-wider text-[var(--text-secondary)] font-[Satoshi]">
                Scraped page content
              </label>
              <span className="text-[12px] font-medium text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                <Check className="h-3.5 w-3.5" /> Scraped successfully
              </span>
            </div>
            <div className="max-h-[260px] overflow-y-auto whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/70 p-4 text-[13px] leading-relaxed text-[var(--text-primary)] font-mono">
              {source.preview_excerpt || 'The page was reachable, but no readable preview text was returned.'}
            </div>
          </div>

          {/* Grounded Extraction Summary */}
          {factsCount > 0 && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/40 p-3.5 flex items-center justify-between text-[13px]">
              <div className="flex items-center gap-2 text-[var(--text-primary)]">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span><strong>{factsCount} grounded facts</strong> prepared for review</span>
              </div>
              <span className="text-[12px] text-[var(--text-secondary)]">Ready to link</span>
            </div>
          )}

          {/* Add to Sources Notice Banner at Bottom */}
          <div className="flex items-start gap-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] p-4 text-[13px] leading-relaxed text-[var(--text-primary)]">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-ink)]" />
            <div>
              <p className="font-semibold text-[var(--text-primary)]">Preview ready to be added</p>
              <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                Chunks are active by default. Approve extracted facts before Aura uses them as facts.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between gap-3 p-4 sm:px-6 border-t border-[var(--border)] bg-[var(--surface)] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 h-[48px] rounded-xl text-[14px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors cursor-pointer border border-transparent"
          >
            Later
          </button>
          
          <button
            type="button"
            onClick={handleAdd}
            disabled={isSubmitting}
            className="px-7 h-[48px] rounded-xl text-[14px] font-bold shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-fg)'
            }}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Approving facts…
              </>
            ) : (
              <>
                <Check className="w-4.5 h-4.5 stroke-[3]" />
                Approve all facts
              </>
            )}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
};
