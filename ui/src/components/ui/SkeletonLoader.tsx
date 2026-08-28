import { cn } from './cn'
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton-shimmer rounded-lg', className)} />
}
export function ChatSkeleton() {
  return (
    <div className="space-y-2.5">
      {/* Typing dots */}
      <div className="flex items-center gap-1.5">
        <div 
          className="w-2 h-2 rounded-full bg-[color:var(--impeccable-accent,var(--brand-accent,#818cf8))] animate-bounce" 
        />
        <div 
          className="w-2 h-2 rounded-full bg-[color:var(--impeccable-accent,var(--brand-accent,#818cf8))] animate-bounce" 
          style={{ animationDelay: '0.15s' }}
        />
        <div 
          className="w-2 h-2 rounded-full bg-[color:var(--impeccable-accent,var(--brand-accent,#818cf8))] animate-bounce" 
          style={{ animationDelay: '0.3s' }}
        />
      </div>
      {/* Skeleton lines */}
      <div className="space-y-2 animate-pulse">
        <Skeleton className="h-3 w-full max-w-[200px]" />
        <Skeleton className="h-3 w-4/5 max-w-[160px]" />
        <Skeleton className="h-3 w-3/5 max-w-[120px]" />
      </div>
      <p className="text-[11px] text-[color:var(--impeccable-accent,var(--brand-accent,#6366f1))] font-medium tracking-wide">
        Thinking…
      </p>
    </div>
  )
}
