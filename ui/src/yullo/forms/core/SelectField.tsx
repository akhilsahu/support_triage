import React from 'react';
import * as Select from '@radix-ui/react-select';
import { Controller, Control } from 'react-hook-form';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectFieldProps {
  label: string;
  error?: string;
  helperText?: string;
  name: string;
  control: Control<any>;
  options: { value: string; label: string }[];
  className?: string;
}

export function SelectField({ label, error, helperText, name, control, options, className }: SelectFieldProps) {
  return (
    <div className="flex flex-col gap-2 mb-6 group">
      <label className="text-[14px] font-[Instrument_Sans] font-medium text-[var(--text-primary)] transition-colors duration-140">
        {label}
      </label>
      
      <Controller
        name={name}
        control={control}
        render={({ field }) => {
          const currentValue = field.value === '' || field.value === null || field.value === undefined ? '_empty' : field.value;

          return (
            <Select.Root 
              value={currentValue} 
              onValueChange={(val) => field.onChange(val === '_empty' ? '' : val)}
            >
              <Select.Trigger
                ref={field.ref}
                className={`flex items-center justify-between w-full px-4 text-[16px] font-[Instrument_Sans] outline-none transition-all duration-140 yullo-form-field bg-[var(--surface-soft)] text-[var(--text-primary)] ${className || ''}`}
                style={{
                  minHeight: '52px',
                  borderRadius: '12px',
                  border: '1px solid transparent',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--focus)';
                  e.currentTarget.style.boxShadow = '0 0 0 4px var(--focus-soft)';
                  e.currentTarget.style.backgroundColor = 'var(--surface)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.backgroundColor = 'var(--surface-soft)';
                  field.onBlur();
                }}
                onMouseEnter={(e) => {
                  if (document.activeElement !== e.currentTarget) {
                    e.currentTarget.style.borderColor = 'var(--border)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (document.activeElement !== e.currentTarget) {
                    e.currentTarget.style.borderColor = 'transparent';
                  }
                }}
              >
                <Select.Value className="text-[var(--text-primary)]" placeholder="Select..." />
                <Select.Icon>
                  <ChevronDown className="w-5 h-5 opacity-70 text-[var(--text-muted)] group-focus-within:text-[var(--text-primary)] transition-colors duration-140" />
                </Select.Icon>
              </Select.Trigger>
              
              <Select.Portal>
                <Select.Content 
                  className="yullo-app overflow-hidden bg-[var(--surface,#171B22)] text-[var(--text-primary,#F3F4F6)] rounded-xl border border-[var(--border,rgba(255,255,255,0.1))] shadow-2xl animate-in fade-in zoom-in-95 duration-200 z-[9999] min-w-[var(--radix-select-trigger-width)]"
                  position="popper"
                  sideOffset={4}
                >
                  <Select.Viewport className="p-1.5 flex flex-col gap-0.5">
                    {options.map(opt => {
                      const itemVal = opt.value === '' ? '_empty' : opt.value;
                      return (
                        <Select.Item
                          key={opt.value || '_empty'}
                          value={itemVal}
                          className="relative flex items-center px-8 py-2.5 text-[15px] font-[Instrument_Sans] text-[var(--text-primary,#F3F4F6)] rounded-lg outline-none select-none hover:bg-[var(--surface-soft)] focus:bg-[var(--surface-soft)] data-[highlighted]:bg-[var(--surface-soft)] data-[highlighted]:text-[var(--text-primary,#F3F4F6)] cursor-pointer transition-colors"
                        >
                          <Select.ItemText>{opt.label}</Select.ItemText>
                          <Select.ItemIndicator className="absolute left-2.5 inline-flex items-center justify-center text-[var(--accent,#FACC15)]">
                            <Check className="w-4 h-4" />
                          </Select.ItemIndicator>
                        </Select.Item>
                      );
                    })}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          );
        }}
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
