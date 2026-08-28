import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle } from 'lucide-react'
import { cn } from './cn'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  leftIcon?: React.ElementType
  rightIcon?: React.ElementType
  onRightIconClick?: () => void
  containerClassName?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      hint,
      error,
      leftIcon: LeftIcon,
      rightIcon: RightIcon,
      onRightIconClick,
      className,
      containerClassName,
      id,
      required,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false)
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`

    return (
      <div className={cn("space-y-1.5 w-full", containerClassName)}>
        {/* Label */}
        {label && (
          <div className="flex items-center justify-between">
            <label
              htmlFor={inputId}
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

        {/* Input Wrapper */}
        <div className="relative group">
          {LeftIcon && (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none transition-colors group-focus-within:text-[color:var(--impeccable-accent,var(--brand-accent,#6366f1))] z-10">
              <LeftIcon className="w-4 h-4" />
            </div>
          )}

          <input
            id={inputId}
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
              "w-full px-4 py-2.5 text-sm transition-all duration-300 ease-out relative z-10 bg-transparent",
              "text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500",
              "focus:outline-none",
              LeftIcon && "pl-10",
              RightIcon && "pr-10",
              className
            )}
            aria-invalid={!!error}
            aria-describedby={
              error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
            }
            {...props}
          />

          {/* Background and Border layer (separate for smooth shadow/border transitions) */}
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

          {RightIcon && (
            <button
              type="button"
              tabIndex={-1}
              onClick={onRightIconClick}
              className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-gray-400 dark:text-gray-500 transition-colors z-20",
                onRightIconClick &&
                  "hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
              )}
            >
              <RightIcon className="w-4 h-4" />
            </button>
          )}

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
Input.displayName = 'Input'
