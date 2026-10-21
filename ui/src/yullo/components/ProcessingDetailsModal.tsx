import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Clock, CheckCircle2, CircleDashed, Loader2, CheckCheck } from 'lucide-react';
import type { SourceItem, FactItem } from './SourceUnderstandingCard';

interface ProcessingDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  source: SourceItem | null;
  onConfirmAll?: (sourceId: string) => void | Promise<void>;
}

const STAGES = [
  'Reading source',
  'Organizing knowledge',
  'Preparing Aura search',
  'Finding facts and useful details',
  'Finalizing'
];

export const ProcessingDetailsModal: React.FC<ProcessingDetailsModalProps> = ({
  isOpen,
  onClose,
  source,
  onConfirmAll,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmedAll, setConfirmedAll] = useState(false);

  const isProcessing = Boolean(source && ['uploaded', 'queued', 'running', 'processing', 'parsing_preview'].includes(source.status));
  const isComplete = Boolean(source && !isProcessing && (source.status === 'ready' || source.status === 'ready_to_review' || (source.progress ?? 0) >= 100));

  useEffect(() => {
    const createdAt = source?.created_at;
    if (!isOpen) return;

    const mountTime = Date.now();
    const computeDiff = () => {
      if (createdAt) {
        const createdStr = createdAt.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(createdAt) ? createdAt : createdAt + 'Z';
        const start = new Date(createdStr).getTime();
        const diff = Math.floor((Date.now() - start) / 1000);
        if (diff >= 0 && diff < 3600) {
          return diff;
        }
      }
      return Math.floor((Date.now() - mountTime) / 1000);
    };

    setElapsedSeconds(computeDiff());

    // If source has finished processing, freeze the elapsed timer and do not increment forward
    if (!isProcessing) return;

    const interval = setInterval(() => {
      setElapsedSeconds(computeDiff());
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, source?.created_at, isProcessing]);

  useEffect(() => {
    // If completed without facts, auto-close after 1.5s
    if (isOpen && source?.status === 'ready' && !source?.facts?.length) {
      const timer = setTimeout(() => {
        onClose();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isOpen, source?.status, source?.facts?.length, onClose]);

  if (!isOpen || !source) return null;

  // Extract normalized facts list
  const rawFacts = source.facts || [];
  const factsList: FactItem[] = rawFacts.map((rawF: any) => {
    if (typeof rawF === 'string') {
      return { text: rawF, evidence_excerpt: '', source_locator: source.content_ref };
    }
    const f = rawF || {};
    let text = '';
    if (typeof f.text === 'string' && f.text.trim()) {
      text = f.text.trim();
    } else if (typeof f.claim === 'string' && f.claim.trim()) {
      text = f.claim.trim();
    } else if (f.label && f.value) {
      text = f.subject ? `${f.subject} — ${f.label}: ${f.value}` : `${f.label}: ${f.value}`;
    } else if (f.value) {
      text = String(f.value);
    }
    return {
      text: text || f.text || '',
      evidence_excerpt: f.evidence_excerpt || '',
      source_locator: f.source_locator || f.source_doc_id || source.content_ref,
    };
  }).filter(f => Boolean(f.text));

  const handleConfirmAll = async () => {
    if (!onConfirmAll || !source.id) return;
    setIsConfirming(true);
    try {
      await onConfirmAll(source.id);
      setConfirmedAll(true);
    } finally {
      setIsConfirming(false);
    }
  };

  // Determine current step index (0 to STAGES.length - 1)
  const currentStageStr = isComplete ? 'Complete' : (source.stage || 'Processing');
  let currentStepIndex = isComplete ? STAGES.length - 1 : STAGES.findIndex(s => currentStageStr.toLowerCase().startsWith(s.toLowerCase()));

  if (currentStepIndex === -1) {
    if (isComplete || (source.progress ?? 0) >= 100 || source.status === 'ready' || source.status === 'ready_to_review') {
      currentStepIndex = STAGES.length - 1;
    } else {
      const lower = currentStageStr.toLowerCase();
      if (source.status === 'parsing_preview' || lower.includes('read') || lower.includes('pars') || lower.includes('scrap')) currentStepIndex = 0;
      else if (lower.includes('chunk') || lower.includes('organi')) currentStepIndex = 1;
      else if (lower.includes('index') || lower.includes('search') || lower.includes('prepar') || lower.includes('enrich') || lower.includes('context')) currentStepIndex = 2;
      else if (lower.includes('fact') || lower.includes('detail') || lower.includes('entit') || lower.includes('understand')) currentStepIndex = 3;
      else if (lower.includes('final') || lower.includes('done')) currentStepIndex = STAGES.length - 1;
      else currentStepIndex = 1; // fallback
    }
  }

  const formatTime = (seconds: number) => {
    if (seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const rawTitle = source.title || source.content_ref || '';
  const displayTitle = rawTitle.includes('/') ? rawTitle.split('/').pop() || rawTitle : rawTitle;

  return createPortal(
    <div 
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 font-[Instrument_Sans]"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)] bg-[var(--surface-soft)]/50">
          <div className="flex items-center gap-2.5">
            {isProcessing ? (
              <Loader2 className="w-4 h-4 text-[var(--accent)] animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            )}
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)] font-[Satoshi]">
              {isProcessing ? 'Processing Knowledge' : 'Knowledge Processed'}
            </h2>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-5 sm:p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          <div className="space-y-1">
            <h3 className="font-semibold text-[15px] font-[Satoshi] truncate text-[var(--text-primary)]" title={rawTitle}>
              {displayTitle}
            </h3>
            <p className="text-[12px] text-[var(--text-secondary)] capitalize font-mono">
              {source.source_type} source · {source.status}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[12px] font-mono text-[var(--text-secondary)]">
              <span>{isComplete ? 'Complete' : currentStageStr}</span>
              <span className="font-bold text-[var(--text-primary)]">{isComplete ? 100 : (source.progress ?? 0)}%</span>
            </div>
            <div className="w-full bg-[var(--surface-soft)] h-2 rounded-full overflow-hidden border border-[var(--border)]">
              <div 
                className="h-full transition-all duration-300 rounded-full"
                style={{ width: `${Math.max(isComplete ? 100 : (source.progress ?? 0), 8)}%`, backgroundColor: 'var(--accent)' }}
              />
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3 p-4 bg-[var(--surface-soft)]/70 rounded-xl border border-[var(--border)]">
            <div>
              <p className="text-[11px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider mb-0.5">Progress</p>
              <p className="text-xl font-bold font-mono text-[var(--text-primary)]">{isComplete ? 100 : (source.progress ?? 0)}%</p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider mb-0.5">Stage</p>
              <p className="text-[14px] font-medium mt-0.5 text-[var(--text-primary)]">
                {isComplete ? '5 of 5' : `${currentStepIndex + 1} of ${STAGES.length}`}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider mb-0.5">Time Elapsed</p>
              <p className="text-[14px] font-mono mt-0.5 text-[var(--text-primary)]">{formatTime(elapsedSeconds)}</p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider mb-0.5">Est. Remaining</p>
              <p className="text-[14px] font-mono mt-0.5 text-[var(--text-primary)]">
                {isComplete 
                  ? 'Complete' 
                  : source.eta_seconds != null && source.eta_seconds > 0 
                    ? formatTime(source.eta_seconds) 
                    : 'Calculating…'}
              </p>
            </div>
          </div>

          {/* Streamed Facts Section */}
          <div className="space-y-3 pt-2 border-t border-[var(--border)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider font-[Satoshi]">
                  Extracted Facts ({factsList.length})
                </span>
                {isProcessing ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse font-[Instrument_Sans]">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" /> Streaming live…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-[Instrument_Sans]">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Extraction complete
                  </span>
                )}
              </div>

              {factsList.length > 0 && onConfirmAll && (
                <button
                  type="button"
                  onClick={handleConfirmAll}
                  disabled={isConfirming || confirmedAll}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--surface-soft)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border)] transition-colors cursor-pointer disabled:opacity-50"
                  title="Confirm all extracted facts"
                >
                  <CheckCheck className={`w-3.5 h-3.5 ${confirmedAll ? 'text-emerald-500' : 'text-[var(--accent-ink)]'}`} />
                  <span>{confirmedAll ? 'All confirmed' : isConfirming ? 'Confirming…' : 'Confirm all facts'}</span>
                </button>
              )}
            </div>

            {factsList.length > 0 ? (
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {factsList.map((fact, idx) => (
                  <div 
                    key={idx}
                    className="p-2.5 rounded-xl bg-[var(--surface-soft)]/70 border border-[var(--border)] text-[12px] leading-relaxed animate-in fade-in slide-in-from-bottom-1 duration-200"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-[var(--accent-ink)] font-bold select-none">•</span>
                      <span className="text-[var(--text-primary)] break-words font-medium">{fact.text}</span>
                    </div>
                    {fact.evidence_excerpt && (
                      <p className="mt-1 pl-3 text-[11px] text-[var(--text-secondary)] italic border-l border-[var(--border)]">
                        "{fact.evidence_excerpt}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-[var(--surface-soft)]/40 border border-dashed border-[var(--border)] text-center">
                <p className="text-[12px] text-[var(--text-secondary)] italic">
                  {isProcessing ? 'Analyzing source text and extracting preliminary facts…' : 'No structured facts found for this source.'}
                </p>
              </div>
            )}
          </div>

          {/* Checklist of Stages */}
          <div className="space-y-3 pt-2 border-t border-[var(--border)]">
            <p className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider font-[Satoshi]">
              Ingestion Stages
            </p>
            <div className="space-y-2.5">
              {STAGES.map((stageName, idx) => {
                const isPast = isComplete || idx < currentStepIndex;
                const isCurrent = !isComplete && idx === currentStepIndex;
                const isFuture = !isComplete && idx > currentStepIndex;
                
                return (
                  <div key={stageName} className={`flex items-center gap-3 ${isFuture ? 'opacity-40' : ''}`}>
                    {isPast ? (
                      <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : isCurrent ? (
                      <Clock className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400 animate-pulse shrink-0" />
                    ) : (
                      <CircleDashed className="w-4.5 h-4.5 text-[var(--text-tertiary)] shrink-0" />
                    )}
                    <span className={`text-[13px] ${isCurrent ? 'font-semibold text-[var(--text-primary)]' : isPast ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'}`}>
                      {isCurrent ? currentStageStr : stageName}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-[11px] text-[var(--text-tertiary)] text-center pt-1 border-t border-[var(--border)]">
            Runs in the background. You can close this modal at any time and return to your work.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
};
