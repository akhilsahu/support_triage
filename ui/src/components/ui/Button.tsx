import { cn } from './cn'
import { motion, HTMLMotionProps } from 'framer-motion'
import { ReactNode } from 'react'

interface ButtonProps extends Omit<HTMLMotionProps<"button">, 'ref' | 'children'> {
  children?: ReactNode
  variant?: 'primary'|'secondary'|'ghost'|'danger'
  size?: 'sm'|'md'|'lg'
  loading?: boolean
}

const staticVariants = {
  secondary: 'bg-[var(--impeccable-surface)] hover:bg-[var(--impeccable-border)] text-[var(--impeccable-text)] border border-[var(--impeccable-border)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
  ghost:     'hover:bg-[var(--impeccable-border)] text-[var(--impeccable-text-muted)] hover:text-[var(--impeccable-text)]',
  danger:    'bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]',
}
const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-6 py-2.5 text-base' }

export function Button({ variant='primary', size='md', loading, className, children, disabled, ...props }: ButtonProps) {
  const isPrimary = variant === 'primary'
  
  // Apple/Emil-style vibrant gradient for primary, with soft inner glow
  // Using color-mix for shadow to avoid needing a separate -rgb variable
  const variantCls = isPrimary 
    ? 'bg-gradient-to-b from-[var(--impeccable-accent)] to-[color-mix(in_oklch,var(--impeccable-accent)_85%,black)] text-white border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_14px_0_color-mix(in_srgb,var(--impeccable-accent)_39%,transparent)]' 
    : staticVariants[variant]
  
  return (
    <motion.button 
      whileHover={{ y: disabled || loading ? 0 : -1 }}
      whileTap={{ scale: disabled || loading ? 1 : 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      {...props} 
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-[opacity,background-color,border-color,box-shadow,filter]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impeccable-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--impeccable-bg)]',
        'disabled:opacity-50 disabled:cursor-not-allowed', 
        variantCls, 
        sizes[size], 
        className
      )}
    >
      {loading && <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </motion.button>
  )
}
