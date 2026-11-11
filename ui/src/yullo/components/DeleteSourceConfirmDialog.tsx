import React, { useEffect, useState } from 'react';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';
import { SourceDeletionImpact, SourceDeletionMode, yulloOnboardingApi } from '../api/onboarding';

interface DeleteSourceConfirmDialogProps {
  isOpen: boolean;
  sourceId?: string;
  sourceTitle?: string;
  sourceVersion?: number;
  isProcessing?: boolean;
  isDeleting?: boolean;
  onConfirm: (mode: SourceDeletionMode, expectedSourceVersion?: number) => void | Promise<void>;
  onCancel: () => void;
}

export const DeleteSourceConfirmDialog: React.FC<DeleteSourceConfirmDialogProps> = ({
  isOpen,
  sourceId,
  sourceTitle,
  sourceVersion,
  isProcessing = false,
  isDeleting: deletingFromParent = false,
  onConfirm,
  onCancel,
}) => {
  const [purgeDerivedData, setPurgeDerivedData] = useState(true);
  const [impact, setImpact] = useState<SourceDeletionImpact | null>(null);
  const [impactError, setImpactError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isDeleting = deletingFromParent || isSubmitting;

  useEffect(() => {
    if (!isOpen || !sourceId) return;
    let active = true;
    setPurgeDerivedData(true);
    setImpact(null);
    setImpactError(null);
    setDeleteError(null);
    yulloOnboardingApi.getSourceDeletionImpact(sourceId)
      .then(value => { if (active) setImpact(value); })
      .catch(() => { if (active) setImpactError('Could not load the related knowledge count.'); });
    return () => { active = false; };
  }, [isOpen, sourceId]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (isDeleting) return;
    setIsSubmitting(true);
    setDeleteError(null);
    try {
      await onConfirm(purgeDerivedData ? 'purge' : 'retain_for_review', sourceVersion ?? impact?.source_version);
    } catch {
      setDeleteError('Could not remove this source. Refresh and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150 font-[Instrument_Sans]">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={() => { if (!isDeleting) onCancel(); }} />

      {/* Dialog Container */}
      <div 
        className="relative w-full max-w-[420px] bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-2xl z-10 overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onCancel}
          disabled={isDeleting}
          aria-label="Close removal dialog"
          className="absolute top-4 right-4 p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          {/* Danger Warning Badge */}
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>

          <h3 className="font-[Satoshi] text-[20px] font-semibold text-[var(--text-primary)] mb-2">
            Remove knowledge source?
          </h3>

          <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed mb-4">
            Remove <span className="font-semibold text-[var(--text-primary)]">{sourceTitle || 'this source'}</span>? Aura will immediately stop using the source.
            {isProcessing && ' Any ongoing analysis will stop.'}
          </p>

          <label className="mb-3 flex w-full cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-left">
            <input
              type="checkbox"
              checked={purgeDerivedData}
              onChange={event => setPurgeDerivedData(event.target.checked)}
              disabled={isDeleting}
              className="mt-0.5 h-4 w-4 accent-[var(--accent-solid)]"
            />
            <span>
              <span className="block text-[13px] font-semibold text-[var(--text-primary)]">Permanently delete related knowledge</span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--text-secondary)]">
                {impact
                  ? `${impact.facts} facts and ${impact.entities_source_only} source-only items will be affected.`
                  : impactError || 'Loading related knowledge…'}
              </span>
            </span>
          </label>

          {!purgeDerivedData && (
            <p className="mb-5 w-full rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-left text-[12px] leading-relaxed text-[var(--text-secondary)]">
              The facts will be paused and added to the notification bell in “What Aura knows.” You can delete them later or explicitly allow Aura to use them without their source.
            </p>
          )}

          {deleteError && <p role="alert" className="mb-3 text-[13px] text-[var(--critical)]">{deleteError}</p>}

          <div className="flex items-center gap-3 w-full">
            <button
              type="button"
              onClick={onCancel}
              disabled={isDeleting}
              className="flex-1 py-2.5 px-4 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] hover:bg-[var(--border)] text-[var(--text-primary)] text-[14px] font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={isDeleting}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[var(--critical)] text-white text-[14px] font-medium hover:opacity-90 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>{isProcessing ? 'Stop and remove' : 'Remove'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
