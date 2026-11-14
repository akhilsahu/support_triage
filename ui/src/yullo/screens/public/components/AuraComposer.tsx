import { useState } from 'react'
import { ArrowUp } from 'lucide-react'

interface AuraComposerProps {
  onSend: (text: string) => void
  disabled?: boolean
}

export function AuraComposer({ onSend, disabled }: AuraComposerProps) {
  const [input, setInput] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim() && !disabled) {
      onSend(input)
      setInput('')
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-[820px]">
      <form onSubmit={handleSubmit} className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={disabled}
          aria-label="Your message"
          placeholder="Ask anything..."
          className="w-full bg-[var(--presentation-surface)] border border-[var(--presentation-border)] text-[var(--presentation-text)] placeholder:text-[var(--presentation-muted)] rounded-2xl py-4 pl-6 pr-14 focus:outline-none focus:ring-2 focus:ring-[var(--presentation-accent-soft)] focus:border-[var(--presentation-accent)] shadow-[0_2px_12px_rgba(0,0,0,0.04)] text-base disabled:opacity-50 transition-colors"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={disabled || !input.trim()}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-xl bg-[var(--presentation-accent)] text-[var(--presentation-accent-contrast)] disabled:opacity-40 transition-opacity hover:opacity-85"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      </form>
    </div>
  )
}
