import { cn } from './cn'
interface BadgeProps { children: React.ReactNode; className?: string; variant?: 'default'|'success'|'warning'|'danger' }
const variants = {
  default: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  danger:  'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
}
export function Badge({ children, className, variant='default' }: BadgeProps) {
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', variants[variant], className)}>{children}</span>
}
