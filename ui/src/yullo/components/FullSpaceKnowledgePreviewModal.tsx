import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Eye, Sparkles, Globe, FileText, CheckCircle2, ChevronDown, ChevronUp, 
  Layers, Info, Calendar, ShieldCheck, Tag, ExternalLink, ArrowRight, User, Briefcase, Building
} from 'lucide-react';
import { SourceItem, FactItem } from './SourceUnderstandingCard';

export interface FullSpaceKnowledgePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceName?: string;
  slug?: string;
  purpose?: string;
  category?: string;
  presence?: string;
  website?: string;
  description?: string;
  logoUrl?: string;
  sources: SourceItem[];
}

export const FullSpaceKnowledgePreviewModal: React.FC<FullSpaceKnowledgePreviewModalProps> = ({
  isOpen,
  onClose,
  spaceName = 'Unnamed Space',
  slug,
  purpose,
  category,
  presence,
  website,
  description,
  logoUrl,
  sources = [],
}) => {
  // Track open state for each source card (default all expanded)
  const [expandedSources, setExpandedSources] = useState<{ [key: string]: boolean }>({});
  const [showRawContent, setShowRawContent] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    if (isOpen) {
      // Expand all by default when modal opens
      const initialMap: { [key: string]: boolean } = {};
      sources.forEach(s => {
        initialMap[s.id] = true;
      });
      setExpandedSources(initialMap);
    }
  }, [isOpen, sources]);

  // Handle ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleExpand = (id: string) => {
    setExpandedSources(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleRawText = (id: string) => {
    setShowRawContent(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    const nextMap: { [key: string]: boolean } = {};
    sources.forEach(s => { nextMap[s.id] = true; });
    setExpandedSources(nextMap);
  };

  const collapseAll = () => {
    setExpandedSources({});
  };

  // Collect statistics
  const totalSources = sources.length;
  const confirmedSources = sources.filter(s => s.is_confirmed).length;
  const totalFacts = sources.reduce((acc, s) => acc + (s.facts ? s.facts.length : 0), 0);

  const getSourceIcon = (sourceType: string) => {
    switch (sourceType) {
      case 'url':
        return <Globe className="w-4 h-4 text-cyan-500 shrink-0" />;
      case 'document':
      case 'file':
        return <FileText className="w-4 h-4 text-purple-400 shrink-0" />;
      default:
        return <FileText className="w-4 h-4 text-blue-400 shrink-0" />;
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-md flex flex-col justify-start items-center p-4 sm:p-6 lg:p-10 font-[Instrument_Sans]">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-5xl bg-[var(--surface,rgba(18,24,38,0.95))] border border-[var(--border,rgba(255,255,255,0.1))] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-[var(--text-primary,#ffffff)] my-auto max-h-[92vh]"
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border,rgba(255,255,255,0.1))] bg-[var(--surface-soft,rgba(255,255,255,0.03))] shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-[var(--accent-ink)]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-[20px] font-bold font-[Satoshi] tracking-tight truncate">
                    {spaceName} — Full Knowledge Preview
                  </h2>
                </div>
                <p className="text-[13px] text-[var(--text-secondary,rgba(255,255,255,0.6))] truncate">
                  {slug ? `@${slug}` : 'Onboarding Draft'} · {totalSources} Source{totalSources !== 1 ? 's' : ''} · {totalFacts} Grounded Fact{totalFacts !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={expandAll}
                className="hidden sm:inline-flex text-[12px] font-medium hover: px-2.5 py-1 rounded-lg border-transparent hover: transition-colors cursor-pointer bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
              >
                Expand all
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="hidden sm:inline-flex text-[12px] font-medium hover: px-2.5 py-1 rounded-lg border-transparent hover: transition-colors cursor-pointer bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
              >
                Collapse all
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-xl flex items-center justify-center hover: transition-colors cursor-pointer bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
                title="Close preview (ESC)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            
            {/* 1. Space Identity & Grounded Overview */}
            <div className="bg-[var(--surface-soft,rgba(255,255,255,0.03))] border border-[var(--border,rgba(255,255,255,0.08))] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border,rgba(255,255,255,0.08))]">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[var(--accent-ink)]" />
                  <h3 className="text-[14px] font-semibold tracking-wide uppercase text-[var(--text-secondary)] font-[Satoshi]">
                    Space Identity & Aura Summary
                  </h3>
                </div>
                {confirmedSources > 0 && (
                  <span className="text-[12px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                    {confirmedSources} active confirmed source{confirmedSources !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Logo & Basic Info */}
                <div className="flex items-center gap-3">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="w-12 h-12 rounded-xl object-cover border border-[var(--border)] shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent-solid)] flex items-center justify-center text-[18px] font-bold font-[Satoshi] text-[var(--accent-ink)] shrink-0">
                      {spaceName.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h4 className="text-[15px] font-semibold text-[var(--text-primary)] truncate">{spaceName}</h4>
                    <p className="text-[13px] text-[var(--text-muted)] truncate">{slug ? `yullo.com/${slug}` : 'Draft Space'}</p>
                  </div>
                </div>

                {/* Attributes */}
                <div className="flex flex-col justify-center space-y-1 text-[13px]">
                  {purpose && (
                    <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                      <span className="font-semibold text-[var(--text-primary)]">Purpose:</span>
                      <span className="capitalize">{purpose}</span>
                    </div>
                  )}
                  {category && (
                    <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                      <span className="font-semibold text-[var(--text-primary)]">Category:</span>
                      <span>{category}</span>
                    </div>
                  )}
                </div>

                {/* Website & Presence */}
                <div className="flex flex-col justify-center space-y-1 text-[13px]">
                  {presence && (
                    <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                      <span className="font-semibold text-[var(--text-primary)]">Presence:</span>
                      <span className="capitalize">{presence}</span>
                    </div>
                  )}
                  {website && (
                    <div className="flex items-center gap-2 text-[var(--text-secondary)] truncate">
                      <span className="font-semibold text-[var(--text-primary)]">Website:</span>
                      <a href={website} target="_blank" rel="noreferrer" className="text-[var(--accent-ink)] hover:underline truncate">
                        {website}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {description && (
                <div className="pt-3 border-t border-[var(--border,rgba(255,255,255,0.06))]">
                  <span className="text-[12px] font-semibold text-[var(--text-muted)] uppercase block mb-1">About Description:</span>
                  <p className="text-[14px] leading-relaxed text-[var(--text-primary)] font-[Instrument_Sans]">
                    {description}
                  </p>
                </div>
              )}
            </div>

            {/* 2. Source-Wise Data Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-semibold font-[Satoshi] tracking-wide text-[var(--text-primary)] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[var(--accent-ink)]" />
                  Source-Wise Knowledge ({totalSources})
                </h3>
                <span className="text-[13px] text-[var(--text-muted)]">
                  Click any source card to expand or collapse details
                </span>
              </div>

              {sources.length === 0 ? (
                <div className="p-8 text-center bg-[var(--surface-soft)] rounded-xl border border-[var(--border)] text-[var(--text-muted)]">
                  No knowledge sources added yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {sources.map((source, index) => {
                    const isExpanded = !!expandedSources[source.id];
                    const isRawOpen = !!showRawContent[source.id];
                    const factsList: FactItem[] = (source.facts || []).map(f =>
                      typeof f === 'string' ? { text: f, evidence_excerpt: '', source_locator: source.content_ref } : f
                    );

                    const titleText = source.title || source.content_ref || `Source #${index + 1}`;
                    const isConfirmed = !!source.is_confirmed;
                    const rawTextPayload = source.preview_excerpt || '';

                    // Detect binary / corrupt content that slipped through
                    // the backend sanitisation layer.
                    const sampleSlice = rawTextPayload.slice(0, 200);
                    const nonPrintable = (sampleSlice.match(/[\x00-\x08\x0E-\x1F]/g) || []).length;
                    const isBinaryContent =
                      rawTextPayload.startsWith('%PDF-') ||
                      (rawTextPayload.match(/\uFFFD/g) || []).length > 10 ||
                      (sampleSlice.length > 0 && nonPrintable / sampleSlice.length > 0.05);

                    const displayRawText = isBinaryContent
                      ? '[Binary document content — extracted facts are shown above]'
                      : rawTextPayload;



                    const charCount = displayRawText.length;

                    return (
                      <div
                        key={source.id}
                        className={`border rounded-xl overflow-hidden transition-all shadow-sm ${
                          isConfirmed 
                            ? 'bg-[var(--surface-soft,rgba(255,255,255,0.04))] border-emerald-500/30' 
                            : 'bg-[var(--surface-soft,rgba(255,255,255,0.02))] border-[var(--border,rgba(255,255,255,0.08))]'
                        }`}
                      >
                        {/* Source Header Row */}
                        <div
                          onClick={() => toggleExpand(source.id)}
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--border,rgba(255,255,255,0.05))] transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-8 h-8 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center shrink-0">
                              {getSourceIcon(source.source_type)}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-[15px] font-semibold text-[var(--text-primary)] truncate">
                                  {titleText}
                                </h4>
                                {isConfirmed ? (
                                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                    In Active Grounding
                                  </span>
                                ) : (
                                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                                    Stored / Unconfirmed
                                  </span>
                                )}
                              </div>
                              <p className="text-[12px] text-[var(--text-muted)] truncate mt-0.5">
                                Type: <span className="capitalize">{source.source_type}</span> · {factsList.length} Grounded Fact{factsList.length !== 1 ? 's' : ''} {charCount > 0 ? `· ${charCount.toLocaleString()} chars raw` : ''}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            {isConfirmed ? (
                              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Active Source
                              </span>
                            ) : source.status === 'ready' ? (
                              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                                Ready (Passive)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded-full">
                                Processing...
                              </span>
                            )}

                            <button type="button" className="text-[var(--text-muted)] hover: p-1 bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Collapsible Content */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="border-t border-[var(--border,rgba(255,255,255,0.06))] p-4 bg-[var(--surface,rgba(0,0,0,0.1))] space-y-4"
                            >
                              {/* Usage / Target Badges Section */}
                              <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-[var(--border,rgba(255,255,255,0.06))]">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[12px] font-medium text-[var(--text-muted)] flex items-center gap-1">
                                    <Tag className="w-3.5 h-3.5" /> Grounding Usage:
                                  </span>
                                  {source.target_badges && source.target_badges.length > 0 ? (
                                    source.target_badges.map((b, bIdx) => (
                                      <span key={bIdx} className="text-[11px] font-medium text-[var(--accent-ink)] bg-[var(--accent-soft)] border border-[var(--accent-soft)] px-2 py-0.5 rounded-md">
                                        Target: {b}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-[11px] font-medium text-slate-400 bg-slate-500/10 border border-slate-500/20 px-2 py-0.5 rounded-md">
                                      Target: Knowledge Base Retrieval
                                    </span>
                                  )}
                                </div>

                                <div className="text-[11px] text-[var(--text-muted)] font-mono">
                                  Status: <span className="uppercase">{source.status}</span>
                                </div>
                              </div>

                              {/* Grounded Facts List (Marked by active vs passive) */}
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <h5 className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                                    Extracted Facts ({factsList.length}):
                                  </h5>
                                  <span className="text-[11px] text-[var(--text-muted)]">
                                    {isConfirmed ? '✓ Fact active in space identity' : '• Fact stored in knowledge index'}
                                  </span>
                                </div>

                                {factsList.length > 0 ? (
                                  <ul className="space-y-2.5 pl-1">
                                    {factsList.map((fact, fIdx) => (
                                      <li key={fIdx} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-[var(--text-primary)] bg-[var(--surface-soft)] p-3 rounded-lg border border-[var(--border)]">
                                        <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${isConfirmed ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                                        <div className="flex-1 space-y-1">
                                          <div className="flex items-start justify-between gap-2">
                                            <span className="font-medium text-[var(--text-primary)]">{fact.text}</span>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 uppercase tracking-wider ${
                                              isConfirmed 
                                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                                                : 'bg-slate-500/15 text-slate-400 border border-slate-500/30'
                                            }`}>
                                              {isConfirmed ? 'Active Claim' : 'Stored Fact'}
                                            </span>
                                          </div>
                                          {fact.evidence_excerpt && (
                                            <p className="text-[12px] text-[var(--text-muted)] italic bg-black/20 p-2 rounded border border-white/5 mt-1 font-mono">
                                              Excerpt: "{fact.evidence_excerpt}"
                                            </p>
                                          )}
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-[13px] text-[var(--text-muted)] italic bg-[var(--surface-soft)] p-3 rounded-lg border border-[var(--border)]">
                                    No grounded facts extracted yet. Source text is stored for retrieval.
                                  </p>
                                )}
                              </div>

                              {/* Raw Text Content View */}
                              {displayRawText ? (
                                <div className="pt-2">
                                  <button
                                    type="button"
                                    onClick={() => toggleRawText(source.id)}
                                    className="text-[12px] font-medium text-[var(--accent-ink)] hover:underline flex items-center gap-1 cursor-pointer font-semibold"
                                  >
                                    {isRawOpen ? 'Hide extracted preview excerpt' : `View extracted preview excerpt (${charCount.toLocaleString()} chars)`}
                                  </button>

                                  {isRawOpen && (
                                    <div className="mt-2 space-y-1">
                                      <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] px-1 font-mono">
                                        <span>[Extracted Preview Excerpt]</span>
                                        <span>{charCount.toLocaleString()} characters</span>
                                      </div>
                                      <pre className="p-3 bg-[var(--surface-soft)] border border-[var(--border)] rounded-lg text-[12px] text-[var(--text-secondary)] whitespace-pre-wrap max-h-[50vh] overflow-y-auto font-mono leading-relaxed select-text">
                                        {displayRawText}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-[11px] text-[var(--text-muted)] italic pt-1 font-mono">
                                  [No preview excerpt available for this source]
                                </div>
                              )}

                              {/* Ingestion & Version Metadata */}
                              <div className="pt-3 border-t border-[var(--border,rgba(255,255,255,0.06))] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                                <div>
                                  Pipeline: <span className="font-mono text-[var(--text-primary)]">{source.status}</span> · Version: <span className="font-mono text-[var(--text-primary)]">v{source.source_version || 1}</span> · Prompt: <span className="font-mono text-[var(--text-primary)]">{source.prompt_version || 'identity-v2'}</span>
                                </div>
                                {source.content_ref && (
                                  <div className="truncate max-w-xs">
                                    Locator: <span className="font-mono text-[var(--text-primary)]">{source.content_ref}</span>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* Modal Footer */}
          <div className="p-4 border-t border-[var(--border,rgba(255,255,255,0.1))] bg-[var(--surface-soft,rgba(255,255,255,0.03))] flex items-center justify-between shrink-0">
            <span className="text-[13px] text-[var(--text-muted)]">
              Press <kbd className="px-1.5 py-0.5 bg-[var(--border)] rounded text-[11px]">ESC</kbd> to close
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-[var(--text-primary,#ffffff)] text-[var(--surface,#121826)] text-[14px] font-semibold rounded-xl hover:opacity-90 transition-opacity cursor-pointer bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
            >
              Close Preview
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
