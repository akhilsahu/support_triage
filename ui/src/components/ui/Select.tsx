import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, ChevronDown } from 'lucide-react'
import { cn } from './cn'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  error?: string
  leftIcon?: React.ElementType
  containerClassName?: string
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      hint,
      error,
      leftIcon: LeftIcon,
      className,
      containerClassName,
      id,
      required,
      children,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false)
    const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`

    return (
      <div className={cn("space-y-1.5 w-full", containerClassName)}>
        {/* Label */}
        {label && (
          <div className="flex items-center justify-between">
            <label
              htmlFor={selectId}
              className="block text-sm font-semibold text-gray-800 dark:text-gray-200"
            >
              {label}
              {!required && (
                <span className="ml-2 text-[11px] font-medium text-gray-400 dark:text-gray-500 font-normal uppercase tracking-wider">
                  Optional
                </span>
              )}
            </label>
          </div>
        )}

        {/* Hint */}
        {hint && !error && (
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium leading-relaxed">
            {hint}
          </p>
        )}

        {/* Error */}
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 font-semibold flex items-center gap-1.5 mt-1">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {error}
          </p>
        )}

        {/* Select Wrapper */}
        <div className="relative group">
          {LeftIcon && (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none transition-colors group-focus-within:text-[color:var(--impeccable-accent,var(--brand-accent,#6366f1))] z-10">
              <LeftIcon className="w-4 h-4" />
            </div>
          )}

          <select
            id={selectId}
            ref={ref}
            required={required}
            onFocus={(e) => {
              setIsFocused(true)
              props.onFocus?.(e)
            }}
            onBlur={(e) => {
              setIsFocused(false)
              props.onBlur?.(e)
            }}
            className={cn(
              "w-full px-4 py-2.5 pr-10 text-sm transition-all duration-300 ease-out relative z-10 bg-transparent appearance-none cursor-pointer",
              "text-gray-900 dark:text-white",
              "focus:outline-none",
              LeftIcon && "pl-10",
              className
            )}
            aria-invalid={!!error}
            aria-describedby={
              error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined
            }
            {...props}
          >
            {children}
          </select>

          {/* Background and Border layer */}
          <div 
            className={cn(
              "absolute inset-0 rounded-xl transition-colors duration-300 pointer-events-none",
              "bg-white dark:bg-gray-800/60 backdrop-blur-md",
              "border",
              error
                ? "border-red-300 dark:border-red-500/50 bg-red-50/30 dark:bg-red-900/10"
                : "border-gray-200 dark:border-gray-700 group-hover:border-gray-300 dark:group-hover:border-gray-600 shadow-sm"
            )}
            style={{
              boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)",
            }}
          />

          {/* Custom Dropdown Chevron */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none z-10">
            <ChevronDown className="w-4 h-4" />
          </div>

          {/* Animated Focus Ring */}
          <motion.div
            initial={false}
            animate={{
              opacity: isFocused ? 0.4 : 0,
              scale: isFocused ? 1 : 0.98,
            }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={cn(
              "absolute -inset-[2px] rounded-[14px] pointer-events-none border-2 z-0",
              error ? "border-red-500" : "border-[color:var(--impeccable-accent,var(--brand-accent,#6366f1))]"
            )}
          />
        </div>
      </div>
    )
  }
)
Select.displayName = 'Select'
