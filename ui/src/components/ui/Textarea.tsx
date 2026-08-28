import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle } from 'lucide-react'
import { cn } from './cn'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
  containerClassName?: string
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      hint,
      error,
      className,
      containerClassName,
      id,
      required,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false)
    const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`

    return (
      <div className={cn("space-y-1.5 w-full", containerClassName)}>
        {/* Label */}
        {label && (
          <div className="flex items-center justify-between">
            <label
              htmlFor={textareaId}
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

        {/* Wrapper */}
        <div className="relative group">
          <textarea
            id={textareaId}
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
              "w-full px-4 py-3 text-sm transition-all duration-300 ease-out relative z-10 bg-transparent resize-y min-h-[80px]",
              "text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500",
              "focus:outline-none",
              className
            )}
            aria-invalid={!!error}
            aria-describedby={
              error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined
            }
            {...props}
          />

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
Textarea.displayName = 'Textarea'
