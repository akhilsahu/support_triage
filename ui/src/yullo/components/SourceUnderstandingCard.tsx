import React, { useState } from 'react';
import { Sparkles, Trash2, ChevronDown, ChevronUp, X, Globe, FileText, CheckCircle2, AlertCircle, Loader2, XCircle } from 'lucide-react';

export interface FactItem {
  text: string;
  evidence_excerpt?: string;
  source_locator?: string;
}

export interface SourceItem {
  id: string;
  source_type: string;
  content_ref: string;
  status: 'ready' | 'insufficient_context' | 'unavailable' | 'queued' | 'running' | string;
  title?: string;
  facts?: Array<FactItem | string>;
  target_badges?: string[];
  preview_excerpt?: string;
  page_count?: number;
  chunk_count?: number;
  is_confirmed?: boolean;
  prompt_version?: string;
  source_version?: number;
  progress?: number;
  stage?: string;
  created_at?: string;
  eta_seconds?: number;
  error_msg?: string;
  fact_extraction_status?: 'done' | 'no_facts_found' | 'failed' | string;
  fact_extraction_error?: string;
  entity_extraction_status?: 'done' | 'no_entities_found' | 'failed' | string;
  entity_extraction_error?: string;
  favicon_url?: string;
  preview_image_url?: string;
  assets?: {
    favicon_url?: string;
    preview_image_url?: string;
    logo_url?: string;
    description?: string;
    images?: Array<{ url: string; alt?: string; title?: string; caption?: string }>;
    documents?: Array<{ url: string; title: string; file_type: string; filename?: string }>;
  };
}

interface SourceUnderstandingCardProps {
  source: SourceItem;
  onUseSource: (id: string) => void;
  onRemove: (id: string) => void;
  onFactsChange?: (id: string, facts: Array<FactItem | string>) => void;
  onToggleConfirm?: (id: string, nextConfirmedState: boolean) => void;
}

export const SourceUnderstandingCard: React.FC<SourceUnderstandingCardProps> = ({
  source,
  onUseSource,
  onRemove,
  onFactsChange,
  onToggleConfirm,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  
  // Strictly rely on backend facts — NO frontend dummy fallbacks
  const initialFacts: FactItem[] = (source.facts || []).map(f => 
    typeof f === 'string' ? { text: f, evidence_excerpt: '', source_locator: source.content_ref } : f
  );

  const [facts, setFacts] = useState<FactItem[]>(initialFacts);
  const [isConfirmed, setIsConfirmed] = useState(source.is_confirmed || false);

  const displayTitle = source.title || source.content_ref.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const handleRemoveFact = (index: number) => {
    const updated = facts.filter((_, i) => i !== index);
    setFacts(updated);
    onFactsChange?.(source.id, updated);
  };

  const handleToggleConfirm = () => {
    if (!isConfirmed && !isUsable) return;
    const nextState = !isConfirmed;
    setIsConfirmed(nextState);
    if (nextState) {
      onUseSource(source.id);
    }
    onToggleConfirm?.(source.id, nextState);
  };

  const isUsable = (
    source.status === 'ready' || source.status === 'ready_to_review'
  ) && Boolean(source.preview_excerpt || source.content_ref);

  return (
    <div className="w-full bg-[var(--surface-soft)] border border-[var(--border)] rounded-[16px] p-4 md:p-5 transition-all shadow-sm mb-3">
      {/* 1. Header Row */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center shrink-0 overflow-hidden">
            {source.source_type === 'url' ? (
              source.favicon_url ? (
                <img
                  src={source.favicon_url}
                  alt=""
                  className="w-4 h-4 object-contain rounded-xs"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    if (e.currentTarget.nextElementSibling) {
                      (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'block';
                    }
                  }}
                />
              ) : null
            ) : null}
            {source.source_type === 'url' ? (
              <Globe
                className="w-4 h-4 text-[var(--accent-ink)]"
                style={source.favicon_url ? { display: 'none' } : undefined}
              />
            ) : (
              <FileText className="w-4 h-4 text-purple-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-[14px] font-semibold text-[var(--text-primary)] truncate font-[Instrument_Sans]">
              {displayTitle}
            </h4>
            {source.content_ref && source.content_ref !== displayTitle && (
              <p className="text-[12px] text-[var(--text-muted)] truncate font-[Instrument_Sans]">
                {source.content_ref}
              </p>
            )}
          </div>
        </div>

        {/* Status Badge */}
        <div className="shrink-0">
          {isConfirmed ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full font-[Instrument_Sans]">
              <CheckCircle2 className="w-3.5 h-3.5" /> In use for Aura
            </span>
          ) : source.status === 'ready' || source.status === 'ready_to_review' ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full font-[Instrument_Sans]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Ready
            </span>
          ) : source.status === 'insufficient_context' ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full font-[Instrument_Sans]">
              <AlertCircle className="w-3.5 h-3.5" /> Insufficient context
            </span>
          ) : source.status === 'queued' || source.status === 'running' ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-500 bg-blue-500/10 px-3 py-1 rounded-full font-[Instrument_Sans]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Ingestion in progress...
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-rose-500 bg-rose-500/10 px-3 py-1 rounded-full font-[Instrument_Sans]">
              <AlertCircle className="w-3.5 h-3.5" /> Unavailable
            </span>
          )}
        </div>
      </div>

      {/* 2. What We Understood Section */}
      <div className="py-3.5 border-b border-[var(--border)]">
        <span className="text-[12px] font-semibold text-[var(--text-muted)] tracking-wider uppercase block mb-2 font-[Instrument_Sans]">
          We found:
        </span>

        {facts.length > 0 ? (
          <ul className="space-y-2">
            {facts.slice(0, 4).map((fact, idx) => (
              <li
                key={idx}
                className="group flex items-start justify-between gap-3 text-[13px] text-[var(--text-primary)] leading-relaxed font-[Instrument_Sans]"
              >
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <span className="text-[var(--accent-ink)] text-[14px] leading-tight select-none">•</span>
                  <span className="break-words">{fact.text}</span>
                </div>
                {!isConfirmed && (
                  <button
                    type="button"
                    onClick={() => handleRemoveFact(idx)}
                    className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 p-1 rounded transition-all shrink-0 cursor-pointer"
                    title="Remove fact"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : source.status === 'ready_to_review' ? (
          <p className="text-[13px] text-[var(--text-muted)] italic leading-relaxed font-[Instrument_Sans]">
            Preview is ready. Use this source to run full indexing and structured extraction.
          </p>
        ) : source.fact_extraction_status === 'no_facts_found' ? (
          <p className="text-[13px] text-[var(--text-muted)] italic leading-relaxed font-[Instrument_Sans]">
            No structured facts were found. Aura can still answer from the indexed source.
          </p>
        ) : source.fact_extraction_status === 'failed' ? (
          <p className="text-[13px] text-[var(--text-muted)] italic leading-relaxed font-[Instrument_Sans]">
            The source is ready, but structured facts could not be prepared. Aura can still use the indexed content.
          </p>
        ) : source.status === 'insufficient_context' ? (
          <p className="text-[13px] text-[var(--text-muted)] italic leading-relaxed font-[Instrument_Sans]">
            Content contains insufficient factual information to extract grounded statements.
          </p>
        ) : source.status === 'unavailable' ? (
          <p className="text-[13px] text-[var(--text-muted)] italic leading-relaxed font-[Instrument_Sans]">
            Ingestion service is currently unavailable for this item.
          </p>
        ) : (
          <p className="text-[13px] text-[var(--text-muted)] italic leading-relaxed font-[Instrument_Sans]">
            Ingestion in progress with Aura... Parsing, chunking and extracting facts.
          </p>
        )}
      </div>

      {/* 3. Used to Suggest Badges */}
      <div className="py-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)]">
        <span className="text-[12px] text-[var(--text-muted)] font-medium font-[Instrument_Sans]">
          Used to suggest:
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {(source.target_badges || ['About', 'Category', 'Aura knowledge']).map((badge, idx) => (
            <span
              key={idx}
              className="text-[11px] font-medium px-2.5 py-0.5 rounded-md bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border)] font-[Instrument_Sans]"
            >
              {badge}
            </span>
          ))}
        </div>
      </div>

      {/* 4. Action Bar */}
      <div className="pt-3 flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer transition-colors font-[Instrument_Sans]"
        >
          {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {showDetails ? 'Hide details' : 'Review details'}
        </button>

        <div className="flex items-center gap-2">
          {isConfirmed ? (
            <button
              type="button"
              onClick={handleToggleConfirm}
              className="px-3.5 py-1.5 bg-[var(--surface)] hover: border-transparent text-[12px] font-medium rounded-xl transition-all cursor-pointer flex items-center gap-1.5 font-[Instrument_Sans] bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
              title="Stop using this source for Aura suggestions"
            >
              <XCircle className="w-3.5 h-3.5 text-amber-500" />
              <span>Stop using source</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleToggleConfirm}
              disabled={!isUsable}
              className="px-3.5 py-1.5 bg-[var(--accent-solid)] text-[var(--accent-on-solid)] text-[12px] font-medium rounded-xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-1.5 font-[Instrument_Sans]"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Use source</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onRemove(source.id)}
            className="px-3 py-1.5 text-red-500 hover:bg-red-500/10 text-[12px] font-medium rounded-xl transition-colors cursor-pointer flex items-center gap-1 font-[Instrument_Sans]"
          >
            <Trash2 className="w-3.5 h-3.5" /> Remove
          </button>
        </div>
      </div>

      {/* 5. Collapsible Review Details Drawer with Excerpts & Locators */}
      {showDetails && (
        <div className="mt-3 pt-3 border-t border-[var(--border)] text-[12px] font-[Instrument_Sans] space-y-3">
          {facts.length > 0 && (
            <div>
              <div className="font-semibold text-[var(--text-primary)] mb-2">Supporting Evidence & Locators:</div>
              <div className="space-y-2">
                {facts.map((fact, idx) => (
                  <div key={idx} className="p-3 bg-[var(--surface)] rounded-xl border border-[var(--border)] space-y-1">
                    <div className="font-medium text-[var(--text-primary)]">• {fact.text}</div>
                    {fact.evidence_excerpt && (
                      <div className="text-[11px] text-[var(--text-secondary)] italic">
                        <span className="font-semibold not-italic">Excerpt:</span> "{fact.evidence_excerpt}"
                      </div>
                    )}
                    {fact.source_locator && (
                      <div className="text-[11px] text-[var(--text-muted)] font-mono truncate">
                        <span className="font-semibold font-sans">Locator:</span> {fact.source_locator}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="font-semibold text-[var(--text-secondary)] mb-1">Raw page content snippet:</div>
            <div className="p-3 bg-[var(--surface)] rounded-xl border border-[var(--border)] text-[var(--text-muted)] text-[11px] leading-relaxed max-h-36 overflow-y-auto font-mono whitespace-pre-wrap">
              {source.preview_excerpt || `Source URL: ${source.content_ref}\nStatus: ${source.status}`}
            </div>
          </div>

          <div className="text-[11px] text-[var(--text-muted)] flex items-center justify-between pt-1">
            <span>Source ID: <span className="font-mono">{source.id}</span></span>
            <span>Provenance: Scraper + Grounded LLM</span>
          </div>
        </div>
      )}
    </div>
  );
};
