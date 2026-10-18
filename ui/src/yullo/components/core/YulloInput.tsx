import React, { forwardRef, InputHTMLAttributes, ReactNode } from 'react';

export interface YulloInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const YulloInput = forwardRef<HTMLInputElement, YulloInputProps>(
  ({ className = '', label, error, hint, leftIcon, rightIcon, id, ...props }, ref) => {
    const generatedId = id || Math.random().toString(36).substr(2, 9);
    
    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={generatedId} className="text-sm font-medium text-[var(--text-primary)]">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 text-[var(--text-tertiary)] flex items-center justify-center">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={generatedId}
            className={`
              w-full rounded-xl bg-[var(--surface-bg)] border border-[var(--border-strong)] 
              text-[var(--text-primary)] placeholder-[var(--text-tertiary)]
              focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] focus:border-transparent
              transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
              ${leftIcon ? 'pl-10' : 'pl-3'}
              ${rightIcon ? 'pr-10' : 'pr-3'}
              py-2.5 text-sm
              ${error ? 'border-[var(--red-500)] focus:ring-[var(--red-500)]' : ''}
              ${className}
            `}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 text-[var(--text-tertiary)] flex items-center justify-center">
              {rightIcon}
            </div>
          )}
        </div>
        {(error || hint) && (
          <p className={`text-xs mt-1 ${error ? 'text-[var(--red-500)]' : 'text-[var(--text-secondary)]'}`}>
            {error || hint}
          </p>
        )}
      </div>
    );
  }
);
YulloInput.displayName = 'YulloInput';
