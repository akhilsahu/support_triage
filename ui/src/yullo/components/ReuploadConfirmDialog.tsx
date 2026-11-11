import React from 'react';
import { UploadCloud, X, Loader2, RefreshCw } from 'lucide-react';

interface ReuploadConfirmDialogProps {
  isOpen: boolean;
  sourceTitle?: string;
  isProcessing?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ReuploadConfirmDialog: React.FC<ReuploadConfirmDialogProps> = ({
  isOpen,
  sourceTitle,
  isProcessing = false,
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
          className="absolute top-4 right-4 p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          {/* Warning Badge */}
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mb-4">
            <RefreshCw className="w-6 h-6" />
          </div>

          <h3 className="font-[Satoshi] text-[20px] font-semibold text-[var(--text-primary)] mb-2">
            File Re-upload Required
          </h3>

          <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed mb-6">
            The original file for <span className="font-semibold text-[var(--text-primary)]">{sourceTitle || 'this source'}</span> is missing from storage and cannot be re-extracted automatically. Would you like to upload it again?
          </p>

          <div className="flex items-center gap-3 w-full">
            <button
              type="button"
              onClick={onCancel}
              disabled={isProcessing}
              className="flex-1 py-2.5 px-4 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] hover:bg-[var(--border)] text-[var(--text-primary)] text-[14px] font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isProcessing}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[var(--accent-solid)] text-[var(--accent-on-solid)] text-[14px] font-medium hover:opacity-90 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  <span>Upload File</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
