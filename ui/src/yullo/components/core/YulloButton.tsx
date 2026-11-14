import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

export interface YulloButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const YulloButton = forwardRef<HTMLButtonElement, YulloButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', type = 'button', isLoading, children, disabled, ...props }, ref) => (
    <button ref={ref} type={type} className={`yullo-button ${className}`} data-variant={variant} data-size={size} aria-busy={isLoading || undefined} disabled={disabled || isLoading} {...props}>
      {isLoading && <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
      {children}
    </button>
  )
);
YulloButton.displayName = 'YulloButton';
