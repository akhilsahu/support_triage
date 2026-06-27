import { cn } from './cn'
interface CardProps { children: React.ReactNode; className?: string; onClick?: () => void }
export function Card({ children, className, onClick }: CardProps) {
  return (
    <div onClick={onClick} className={cn(
      'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm',
      onClick && 'cursor-pointer hover:shadow-md transition-shadow',
      className
    )}>{children}</div>
  )
}
