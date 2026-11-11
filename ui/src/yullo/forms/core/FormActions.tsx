import React from 'react';
import { Trash2, Loader2 } from 'lucide-react';

interface FormActionsProps {
  onCancel?: () => void;
  onDelete?: () => void;
  isSubmitting?: boolean;
  submitLabel?: string;
  className?: string;
  form?: string;
}

export function FormActions({ onCancel, onDelete, isSubmitting, submitLabel = 'Save changes', className, form }: FormActionsProps) {
  return (
    <div 
      className={`sticky bottom-0 z-20 flex items-center justify-between gap-3 pt-4 pb-[max(16px,env(safe-area-inset-bottom))] bg-[var(--surface)] border-t border-[var(--border)] ${className || ''}`}
    >
      <div>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[14px] font-[Instrument_Sans] font-medium text-[#ef4444] bg-[#ef4444]/10 hover:bg-[#ef4444]/20 border border-[#ef4444]/20 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete space</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-lg text-[16px] font-[Instrument_Sans] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          form={form}
          disabled={isSubmitting}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[16px] font-[Instrument_Sans] font-medium shadow-sm hover:shadow-md transition-all duration-300 disabled:opacity-50 hover:-translate-y-[1px] active:translate-y-[0px] active:shadow-sm cursor-pointer bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 border border-transparent"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{isSubmitting ? 'Saving...' : submitLabel}</span>
        </button>
      </div>
    </div>
  );
}
