import { cn } from './cn'
import { useDashboardTheme } from '../../config/dashboardTheme'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary'|'secondary'|'ghost'|'danger'
  size?: 'sm'|'md'|'lg'
  loading?: boolean
}

const staticVariants = {
  secondary: 'bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600',
  ghost:     'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300',
  danger:    'bg-red-600 hover:bg-red-700 text-white',
}
const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-base' }

export function Button({ variant='primary', size='md', loading, className, children, disabled, ...props }: ButtonProps) {
  const dt = useDashboardTheme()
  const variantCls = variant === 'primary' ? dt.primaryBtn : staticVariants[variant]
  return (
    <button {...props} disabled={disabled || loading}
      className={cn('inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed', variantCls, sizes[size], className)}>
      {loading && <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  )
}
