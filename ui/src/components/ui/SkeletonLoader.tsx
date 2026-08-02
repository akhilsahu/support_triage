import { cn } from './cn'
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton-shimmer rounded-lg', className)} />
}
export function ChatSkeleton() {
  return (
    <div className="space-y-2.5">
      {/* Typing dots */}
      <div className="flex items-center gap-1.5">
        {[0, 150, 300].map(delay => (
          <span
            key={delay}
            className="w-2 h-2 rounded-full bg-indigo-400 dark:bg-indigo-500 animate-bounce"
            style={{ animationDelay: `${delay}ms`, animationDuration: '900ms' }}
          />
        ))}
      </div>
      {/* Skeleton lines */}
      <div className="space-y-2 animate-pulse">
        <Skeleton className="h-3 w-full max-w-[200px]" />
        <Skeleton className="h-3 w-4/5 max-w-[160px]" />
        <Skeleton className="h-3 w-3/5 max-w-[120px]" />
      </div>
      <p className="text-[11px] text-indigo-500 dark:text-indigo-400 font-medium tracking-wide">
        Thinking…
      </p>
    </div>
  )
}
