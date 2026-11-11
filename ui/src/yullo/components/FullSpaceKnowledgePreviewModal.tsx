import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Globe, FileText, CheckCircle2, ChevronDown, ChevronUp, 
  Layers, ShieldCheck, Tag, ArrowRight, MapPin
} from 'lucide-react';
import { SourceItem, FactItem } from './SourceUnderstandingCard';
import { getBaseDomain } from '../config';

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

export interface NormalizedFact {
  text: string;
  subject?: string;
  label?: string;
  value?: string;
  note?: string;
  evidence_excerpt?: string;
  source_locator?: string;
}

export function formatFactDisplay(f: any, defaultLocator?: string): NormalizedFact {
  if (!f) {
    return { text: '', source_locator: defaultLocator };
  }
  if (typeof f === 'string') {
    return { text: f, source_locator: defaultLocator };
  }

  const subject = f.subject ? String(f.subject).trim() : undefined;
  const label = f.label ? String(f.label).trim() : undefined;
  const value = f.value !== undefined && f.value !== null ? String(f.value).trim() : undefined;
  const note = f.note ? String(f.note).trim() : undefined;
  const evidence_excerpt = f.evidence_excerpt ? String(f.evidence_excerpt).trim() : undefined;
  const source_locator = f.source_locator || f.source_doc_id || defaultLocator;

  let text = '';
  if (typeof f.text === 'string' && f.text.trim()) {
    text = f.text.trim();
  } else if (typeof f.claim === 'string' && f.claim.trim()) {
    text = f.claim.trim();
  } else if (typeof f.statement === 'string' && f.statement.trim()) {
    text = f.statement.trim();
  } else if (typeof f.fact === 'string' && f.fact.trim()) {
    text = f.fact.trim();
  } else if (label && value) {
    text = subject ? `${subject} — ${label}: ${value}` : `${label}: ${value}`;
  } else if (value) {
    text = value;
  } else if (label) {
    text = label;
  }

  return {
    text,
    subject,
    label,
    value,
    note,
    evidence_excerpt,
    source_locator
  };
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
  const confirmedSources = sources.filter(s => s.is_confirmed !== false).length;
  const totalFacts = sources.reduce((acc, s) => acc + (s.facts ? s.facts.length : 0), 0);

  const getSourceIcon = (sourceType: string) => {
    switch (sourceType) {
      case 'url':
        return <Globe className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />;
      case 'document':
      case 'file':
        return <FileText className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />;
      default:
        return <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />;
    }
  };

  return (
    <AnimatePresence>
      <div className="yullo-app fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-md flex flex-col justify-start items-center p-3 sm:p-6 lg:p-8 font-[Instrument_Sans]">
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 12 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-5xl bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-[var(--text-primary)] my-auto max-h-[92vh]"
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border)] bg-[var(--surface-soft)] shrink-0">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent-solid)] text-[var(--accent-on-solid)] flex items-center justify-center shrink-0 shadow-xs">
                <Layers className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[19px] sm:text-[21px] font-bold font-[Satoshi] tracking-tight text-[var(--text-primary)] truncate">
                  {spaceName} — Full Knowledge Preview
                </h2>
                <p className="text-[13px] text-[var(--text-secondary)] truncate">
                  {slug ? `@${slug}` : 'Space Knowledge'} · {totalSources} Source{totalSources !== 1 ? 's' : ''} · {totalFacts} Grounded Fact{totalFacts !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={expandAll}
                className="hidden sm:inline-flex text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors cursor-pointer"
              >
                Expand all
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="hidden sm:inline-flex text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors cursor-pointer"
              >
                Collapse all
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-soft)] border border-[var(--border)] transition-colors cursor-pointer"
                title="Close preview (ESC)"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-7">
            
            {/* 1. Space Identity & Grounded Overview */}
            <div className="bg-[var(--surface-soft)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-[13px] font-bold tracking-wider uppercase text-[var(--text-secondary)] font-[Satoshi]">
                    Space Identity & Aura Summary
                  </h3>
                </div>
                {confirmedSources > 0 && (
                  <span className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                    {confirmedSources} enabled source{confirmedSources !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Logo & Basic Info */}
                <div className="flex items-center gap-3.5">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="w-12 h-12 rounded-xl object-cover border border-[var(--border)] shrink-0 bg-[var(--surface)]" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--accent-solid)] to-amber-400 text-[var(--accent-on-solid)] flex items-center justify-center text-[18px] font-bold font-[Satoshi] shrink-0 shadow-xs">
                      {spaceName.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h4 className="text-[15px] font-bold text-[var(--text-primary)] truncate font-[Satoshi]">{spaceName}</h4>
                    <p className="text-[13px] text-[var(--text-secondary)] truncate font-mono">{slug ? `${getBaseDomain()}/${slug}` : 'Draft Space'}</p>
                  </div>
                </div>

                {/* Attributes */}
                <div className="flex flex-col justify-center space-y-1.5 text-[13px]">
                  {purpose && (
                    <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                      <span className="font-semibold text-[var(--text-primary)]">Purpose:</span>
                      <span className="capitalize text-[var(--text-primary)]">{purpose}</span>
                    </div>
                  )}
                  {category && (
                    <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                      <span className="font-semibold text-[var(--text-primary)]">Category:</span>
                      <span className="text-[var(--text-primary)]">{category}</span>
                    </div>
                  )}
                </div>

                {/* Website & Presence */}
                <div className="flex flex-col justify-center space-y-1.5 text-[13px]">
                  {presence && (
                    <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                      <MapPin className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                      <span className="font-semibold text-[var(--text-primary)]">Presence:</span>
                      <span className="capitalize text-[var(--text-primary)]">{presence}</span>
                    </div>
                  )}
                  {website && (
                    <div className="flex items-center gap-2 text-[var(--text-secondary)] truncate">
                      <Globe className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                      <span className="font-semibold text-[var(--text-primary)]">Website:</span>
                      <a href={website} target="_blank" rel="noreferrer" className="text-[var(--accent-ink)] hover:underline truncate">
                        {website.replace(/^https?:\/\//i, '').replace(/\/$/, '')}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {description && (
                <div className="pt-3.5 border-t border-[var(--border)]">
                  <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-1">
                    About Description:
                  </span>
                  <p className="text-[14px] leading-relaxed text-[var(--text-primary)]">
                    {description}
                  </p>
                </div>
              )}
            </div>

            {/* 2. Source-Wise Data Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-bold font-[Satoshi] tracking-tight text-[var(--text-primary)] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[var(--accent-ink)]" />
                  Source-Wise Knowledge ({totalSources})
                </h3>
                <span className="text-[12px] text-[var(--text-muted)] hidden sm:inline">
                  Click any source to expand or collapse facts
                </span>
              </div>

              {sources.length === 0 ? (
                <div className="p-8 text-center bg-[var(--surface-soft)] rounded-xl border border-[var(--border)] text-[var(--text-muted)]">
                  No knowledge sources added yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {sources.map((source, index) => {
                    const isExpanded = !!expandedSources[source.id];
                    const isRawOpen = !!showRawContent[source.id];
                    
                    // Normalize every fact whether it's a structured object, string, or claim
                    const factsList: NormalizedFact[] = (source.facts || []).map(f =>
                      formatFactDisplay(f, source.content_ref)
                    ).filter(f => f.text || f.label || f.value);

                    const titleText = source.title || source.content_ref || `Source #${index + 1}`;
                    const isConfirmed = source.is_confirmed !== false;
                    const rawTextPayload = source.preview_excerpt || '';

                    // Detect binary content
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
                        className={`rounded-2xl border transition-all overflow-hidden ${
                          isConfirmed 
                            ? 'bg-[var(--surface)] border-emerald-500/30 shadow-xs' 
                            : 'bg-[var(--surface)] border-[var(--border)] shadow-xs'
                        }`}
                      >
                        {/* Source Header Row */}
                        <div
                          onClick={() => toggleExpand(source.id)}
                          className="flex items-center justify-between p-4 sm:p-5 cursor-pointer hover:bg-[var(--surface-soft)]/60 transition-colors"
                        >
                          <div className="flex items-center gap-3.5 min-w-0 flex-1">
                            <div className="w-9 h-9 rounded-xl bg-[var(--surface-soft)] border border-[var(--border)] flex items-center justify-center shrink-0">
                              {getSourceIcon(source.source_type)}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-[15px] font-bold text-[var(--text-primary)] truncate font-[Satoshi]">
                                  {titleText}
                                </h4>
                                {isConfirmed ? (
                                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                    Chunks enabled
                                  </span>
                                ) : (
                                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                    Source paused
                                  </span>
                                )}
                              </div>
                              <p className="text-[12px] text-[var(--text-secondary)] truncate mt-0.5 font-mono">
                                Type: <span className="capitalize">{source.source_type}</span> · {factsList.length} Grounded Fact{factsList.length !== 1 ? 's' : ''} {charCount > 0 ? `· ${charCount.toLocaleString()} chars raw` : ''}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            {isConfirmed ? (
                              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Active Source
                              </span>
                            ) : source.status === 'ready' ? (
                              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full">
                                Ready (Passive)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-500/10 border border-blue-500/30 px-3 py-1 rounded-full">
                                Processing...
                              </span>
                            )}

                            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-soft)] border border-[var(--border)] transition-colors">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </div>
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
                              className="border-t border-[var(--border)] p-4 sm:p-5 bg-[var(--surface-soft)]/40 space-y-4"
                            >
                              {/* Usage / Target Badges Section */}
                              <div className="flex items-center justify-between flex-wrap gap-2 pb-3.5 border-b border-[var(--border)]">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[12px] font-semibold text-[var(--text-secondary)] flex items-center gap-1">
                                    <Tag className="w-3.5 h-3.5" /> Grounding Usage:
                                  </span>
                                  {source.target_badges && source.target_badges.length > 0 ? (
                                    source.target_badges.map((b, bIdx) => (
                                      <span key={bIdx} className="text-[11px] font-semibold text-[var(--text-primary)] bg-[var(--surface)] border border-[var(--border)] px-2.5 py-0.5 rounded-md shadow-2xs">
                                        Target: {b}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-[11px] font-semibold text-[var(--text-secondary)] bg-[var(--surface)] border border-[var(--border)] px-2.5 py-0.5 rounded-md shadow-2xs">
                                      Target: Knowledge Base Retrieval
                                    </span>
                                  )}
                                </div>

                                <div className="text-[11px] text-[var(--text-secondary)] font-mono">
                                  Status: <span className="uppercase font-semibold text-[var(--text-primary)]">{source.status}</span>
                                </div>
                              </div>

                              {/* Grounded Facts List (Marked by active vs passive) */}
                              <div>
                                <div className="flex items-center justify-between mb-2.5">
                                  <h5 className="text-[12px] font-bold text-[var(--text-secondary)] uppercase tracking-wider font-[Satoshi]">
                                    Extracted Facts ({factsList.length}):
                                  </h5>
                                  <span className="text-[12px] font-medium text-[var(--text-secondary)]">
                                    Fact usage is controlled by fact review
                                  </span>
                                </div>

                                {factsList.length > 0 ? (
                                  <ul className="space-y-2.5">
                                    {factsList.map((fact, fIdx) => (
                                      <li 
                                        key={fIdx} 
                                        className="flex items-start gap-3 text-[13px] leading-relaxed text-[var(--text-primary)] bg-[var(--surface)] hover:bg-[var(--surface-soft)] p-3.5 rounded-xl border border-[var(--border)] transition-colors shadow-2xs"
                                      >
                                        <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${isConfirmed ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                        
                                        <div className="flex-1 min-w-0 space-y-1">
                                          <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                                            
                                            {/* Fact Content Text */}
                                            <div className="text-[13px] text-[var(--text-primary)] flex-1 min-w-0">
                                              {fact.label && fact.value ? (
                                                <div>
                                                  {fact.subject && (
                                                    <span className="inline-block font-mono text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--surface-soft)] border border-[var(--border)] mr-2 mb-1">
                                                      {fact.subject}
                                                    </span>
                                                  )}
                                                  <span className="font-bold text-[var(--text-primary)]">{fact.label}: </span>
                                                  <span className="font-normal text-[var(--text-primary)]">{fact.value}</span>
                                                  {fact.note && (
                                                    <span className="text-[12px] text-[var(--text-secondary)] italic block mt-0.5">
                                                      ({fact.note})
                                                    </span>
                                                  )}
                                                </div>
                                              ) : (
                                                <span className="font-medium text-[var(--text-primary)] break-words">
                                                  {fact.text}
                                                </span>
                                              )}
                                            </div>

                                            {/* Active Claim Badge */}
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 uppercase tracking-wider font-mono border ${
                                              isConfirmed 
                                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' 
                                                : 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30'
                                            }`}>
                                              Saved fact
                                            </span>
                                          </div>

                                          {fact.evidence_excerpt && (
                                            <p className="text-[12px] text-[var(--text-secondary)] italic bg-[var(--surface-soft)] p-2.5 rounded-lg border border-[var(--border)] mt-1.5 font-mono leading-relaxed">
                                              Excerpt: "{fact.evidence_excerpt}"
                                            </p>
                                          )}
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <div className="text-[13px] text-[var(--text-secondary)] italic bg-[var(--surface)] p-3.5 rounded-xl border border-[var(--border)]">
                                    No grounded facts extracted yet. Source text is stored for retrieval.
                                  </div>
                                )}
                              </div>

                              {/* Raw Text Content View */}
                              {displayRawText ? (
                                <div className="pt-2">
                                  <button
                                    type="button"
                                    onClick={() => toggleRawText(source.id)}
                                    className="text-[12px] font-semibold text-[var(--accent-ink)] hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <span>
                                      {isRawOpen ? 'Hide extracted preview excerpt' : `View extracted preview excerpt (${charCount.toLocaleString()} chars)`}
                                    </span>
                                  </button>

                                  {isRawOpen && (
                                    <div className="mt-2.5 space-y-1.5">
                                      <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] px-1 font-mono">
                                        <span>[Extracted Preview Excerpt]</span>
                                        <span>{charCount.toLocaleString()} characters</span>
                                      </div>
                                      <pre className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-[12px] text-[var(--text-primary)] whitespace-pre-wrap max-h-[50vh] overflow-y-auto font-mono leading-relaxed select-text shadow-2xs">
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
                              <div className="pt-3.5 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)]">
                                <div>
                                  Pipeline: <span className="font-mono font-semibold text-[var(--text-primary)]">{source.status}</span> · Version: <span className="font-mono font-semibold text-[var(--text-primary)]">v{source.source_version || 1}</span> · Prompt: <span className="font-mono font-semibold text-[var(--text-primary)]">{source.prompt_version || 'identity-v2'}</span>
                                </div>
                                {source.content_ref && (
                                  <div className="truncate max-w-xs font-mono">
                                    Locator: <span className="text-[var(--text-primary)]">{source.content_ref}</span>
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
          <div className="p-4 sm:px-6 border-t border-[var(--border)] bg-[var(--surface-soft)] flex items-center justify-between shrink-0">
            <span className="text-[13px] text-[var(--text-secondary)]">
              Press <kbd className="px-2 py-0.5 bg-[var(--surface)] border border-[var(--border)] rounded text-[11px] font-mono shadow-2xs">ESC</kbd> to close
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-[var(--accent-solid)] text-[var(--accent-on-solid)] text-[14px] font-semibold rounded-xl hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
            >
              Close Preview
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
