import { cn } from './cn'
type Status = 'connected'|'disconnected'|'checking'|'active'|'idle'
const colors: Record<Status,string> = {
  connected:    'bg-emerald-500',
  active:       'bg-emerald-500 animate-pulse',
  disconnected: 'bg-red-500',
  checking:     'bg-yellow-500 animate-pulse',
  idle:         'bg-gray-400',
}
export function StatusDot({ status, className }: { status: Status; className?: string }) {
  return <span className={cn('inline-block w-2 h-2 rounded-full flex-shrink-0', colors[status], className)} />
}
