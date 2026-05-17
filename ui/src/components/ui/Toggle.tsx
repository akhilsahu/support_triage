import { cn } from './cn'
interface ToggleProps { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; size?: 'sm'|'md' }
export function Toggle({ checked, onChange, disabled, size='md' }: ToggleProps) {
  const isMd = size === 'md'
  // Track dimensions: md = 44×24px, sm = 32×16px
  // Thumb dimensions: md = 20×20px, sm = 12×12px
  // translateX: off=2px, on=(track_w - thumb_w - 2)
  const onTranslate = isMd ? 22 : 18
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'relative inline-flex items-center flex-shrink-0 rounded-full transition-colors duration-200',
        'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
        isMd ? 'w-11 h-6' : 'w-8 h-4',
        checked ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600',
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      )}
    >
      <span
        className="inline-block rounded-full bg-white shadow-sm transition-transform duration-200"
        style={{
          width:  isMd ? 20 : 12,
          height: isMd ? 20 : 12,
          transform: `translateX(${checked ? onTranslate : 2}px)`,
        }}
      />
    </button>
  )
}
