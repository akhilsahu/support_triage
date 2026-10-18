import React from 'react';
import * as RadioGroup from '@radix-ui/react-radio-group';
import { Controller, Control } from 'react-hook-form';

export interface SegmentedFieldProps {
  label: string;
  error?: string;
  helperText?: string;
  name: string;
  control: Control<any>;
  options: { value: string; label: string }[];
  className?: string;
}

export function SegmentedField({ label, error, helperText, name, control, options, className }: SegmentedFieldProps) {
  return (
    <div className="flex flex-col gap-2 mb-6 group">
      <label className="text-[14px] font-[Instrument_Sans] font-medium text-[var(--text-primary)] transition-colors duration-140">
        {label}
      </label>
      
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <RadioGroup.Root
            className={`grid grid-cols-2 min-[900px]:grid-cols-4 gap-2 ${className || ''}`}
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            ref={field.ref}
            orientation="horizontal"
          >
            {options.map((opt) => (
              <RadioGroup.Item
                key={opt.value}
                value={opt.value}
                className="
                  px-4 py-3 rounded-xl text-[14px] font-[Instrument_Sans] font-medium outline-none text-center
                  transition-all duration-140
                  bg-[var(--surface-soft)] text-[var(--text-secondary)] border border-transparent
                  hover:bg-[var(--surface)] hover:border-[var(--border)]
                  data-[state=checked]:bg-[var(--accent-solid)] data-[state=checked]:text-[var(--accent-fg)] data-[state=checked]:border-[var(--accent)]
                  focus-visible:ring-4 focus-visible:ring-[var(--focus-soft)] focus-visible:border-[var(--focus)]
                "
              >
                {opt.label}
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
        )}
      />

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
