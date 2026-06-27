import { cn } from './cn'
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700', className)} />
}
export function ChatSkeleton() {
  return (
    <div className="flex gap-3 animate-pulse">
      <div className="w-8 h-8 rounded-full bg-indigo-200 dark:bg-indigo-900 flex-shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-2/3" />
        <p className="text-xs text-indigo-500 dark:text-indigo-400 flex items-center gap-1.5 mt-2">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
          Searching knowledge base…
        </p>
      </div>
    </div>
  )
}
