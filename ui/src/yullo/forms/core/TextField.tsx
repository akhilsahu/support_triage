import React from 'react';
import { UseFormRegisterReturn } from 'react-hook-form';

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
  registration: UseFormRegisterReturn;
}

export function TextField({ label, error, helperText, registration, className, ...props }: TextFieldProps) {
  return (
    <div className="flex flex-col gap-2 mb-6 group">
      <label className="text-[14px] font-[Instrument_Sans] font-medium text-[var(--text-primary)] transition-colors duration-140">
        {label}
      </label>
      <div className="relative">
        <input
          {...registration}
          {...props}
          className={`w-full px-4 py-3.5 text-[16px] font-[Instrument_Sans] outline-none transition-all duration-140 yullo-form-field bg-[var(--surface-soft)] placeholder:text-[var(--text-muted)] placeholder:font-light ${className || ''}`}
          style={{
            minHeight: '52px',
            borderRadius: '12px',
            border: '1px solid transparent',
            color: 'var(--text-primary)',
          }}
          onFocus={(e) => {
            (e.target as HTMLInputElement).style.borderColor = 'var(--focus)';
            (e.target as HTMLInputElement).style.boxShadow = '0 0 0 4px var(--focus-soft)';
            (e.target as HTMLInputElement).style.backgroundColor = 'var(--surface)';
          }}
          onBlur={(e) => {
            (e.target as HTMLInputElement).style.borderColor = 'transparent';
            (e.target as HTMLInputElement).style.boxShadow = 'none';
            (e.target as HTMLInputElement).style.backgroundColor = 'var(--surface-soft)';
            registration.onBlur(e);
          }}
          onMouseEnter={(e) => {
            if (document.activeElement !== e.target) {
              (e.target as HTMLInputElement).style.borderColor = 'var(--border)';
            }
          }}
          onMouseLeave={(e) => {
            if (document.activeElement !== e.target) {
              (e.target as HTMLInputElement).style.borderColor = 'transparent';
            }
          }}
        />
      </div>
      {error && (
        <p className="text-[13px] text-[var(--attention, #ef4444)] font-[Instrument_Sans] mt-0.5 animate-in fade-in slide-in-from-top-1 duration-150" role="alert">
          {error}
        </p>
      )}
      {helperText && !error && (
        <p className="text-[13px] text-[var(--text-secondary)] font-[Instrument_Sans] mt-0.5 transition-opacity duration-150">
          {helperText}
        </p>
      )}
    </div>
  );
}
