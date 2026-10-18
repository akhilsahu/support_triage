import React, { forwardRef, ButtonHTMLAttributes } from 'react';

export interface YulloButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const YulloButton = forwardRef<HTMLButtonElement, YulloButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl';
    
    const variants = {
      primary: 'bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 focus:ring-[var(--accent-ring)] border border-[var(--accent-solid)]',
      secondary: 'bg-[var(--surface-elevated)] text-[var(--text-primary)] border border-[var(--border-strong)] hover:bg-[var(--surface-bg)] focus:ring-[var(--accent-ring)]',
      outline: 'border border-[var(--accent-border)] text-[var(--accent-ink)] hover:bg-[var(--surface-soft)] focus:ring-[var(--accent-ring)]',
      ghost: 'text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)] focus:ring-[var(--accent-ring)]',
      danger: 'bg-[var(--critical)] text-white hover:opacity-90 focus:ring-[var(--critical)]',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
    };

    const styles = `${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`;

    return (
      <button ref={ref} className={styles} disabled={disabled || isLoading} {...props}>
        {isLoading && (
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        )}
        {children}
      </button>
    );
  }
);
YulloButton.displayName = 'YulloButton';
