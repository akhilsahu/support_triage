import { Trash2 } from 'lucide-react';
import { YulloButton } from '../../components/core/YulloButton';

interface FormActionsProps {
  onCancel?: () => void;
  onDelete?: () => void;
  deleteIconOnly?: boolean;
  isSubmitting?: boolean;
  isDisabled?: boolean;
  submitLabel?: string;
  className?: string;
  form?: string;
}

export function FormActions({ onCancel, onDelete, deleteIconOnly = false, isSubmitting, isDisabled, submitLabel = 'Save changes', className, form }: FormActionsProps) {
  return <div className={`sticky bottom-0 z-20 flex items-center justify-between gap-3 pt-4 pb-[max(16px,env(safe-area-inset-bottom))] bg-[var(--surface)] border-t border-[var(--border)] ${className || ''}`}>
    <div>{onDelete && <YulloButton variant="danger" size={deleteIconOnly ? 'icon' : 'md'} aria-label="Delete space" title="Delete space" onClick={onDelete} disabled={isSubmitting}><Trash2 size={16} aria-hidden="true" />{!deleteIconOnly && 'Delete space'}</YulloButton>}</div>
    <div className="flex items-center gap-3">
      {onCancel && <YulloButton variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancel</YulloButton>}
      <YulloButton type="submit" form={form} isLoading={isSubmitting} disabled={isDisabled}>{isSubmitting ? 'Saving…' : submitLabel}</YulloButton>
    </div>
  </div>;
}
