import React from 'react';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';

interface DeleteSourceConfirmDialogProps {
  isOpen: boolean;
  sourceTitle?: string;
  isDeleting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteSourceConfirmDialog: React.FC<DeleteSourceConfirmDialogProps> = ({
  isOpen,
  sourceTitle,
  isDeleting = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150 font-[Instrument_Sans]">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onCancel} />

      {/* Dialog Container */}
      <div 
        className="relative w-full max-w-[420px] bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-2xl z-10 overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover: hover: transition-colors bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
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

          <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed mb-6">
            Are you sure you want to remove <span className="font-semibold text-[var(--text-primary)]">{sourceTitle || 'this source'}</span>? Aura will no longer use facts extracted from this material.
          </p>

          <div className="flex items-center gap-3 w-full">
            <button
              type="button"
              onClick={onCancel}
              disabled={isDeleting}
              className="flex-1 py-2.5 px-4 rounded-xl border-transparent text-[14px] font-medium hover: transition-colors cursor-pointer bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
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
                  <span>Remove</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
