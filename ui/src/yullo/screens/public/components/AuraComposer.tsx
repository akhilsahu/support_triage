import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUp } from 'lucide-react'

interface AuraComposerProps {
  layoutId?: string
  isDocked?: boolean
  onSend: (text: string) => void
  isTyping?: boolean
  disabled?: boolean
}

export function AuraComposer({ layoutId, isDocked, onSend, isTyping, disabled }: AuraComposerProps) {
  const [input, setInput] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim() && !disabled) {
      onSend(input)
      setInput('')
    }
  }

  const composerContent = (
    <div className={`relative w-full ${isDocked ? 'max-w-[820px] mx-auto' : 'max-w-[820px] mx-auto'}`}>
      <form onSubmit={handleSubmit} className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={disabled}
          placeholder="Ask anything..."
          className="w-full bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 rounded-2xl py-4 pl-6 pr-14 focus:outline-none focus:ring-2 focus:ring-[#FFFC00]/40 focus:border-[#FFFC00] shadow-[0_2px_12px_rgba(0,0,0,0.04)] text-base disabled:opacity-50 transition-all"
        />
        <button
          type="submit"
          disabled={disabled || !input.trim()}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-xl bg-[#FFFC00] text-black hover:bg-[#E5E300] disabled:opacity-50 disabled:bg-gray-100 disabled:text-gray-400 transition-colors bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      </form>
    </div>
  )

  if (layoutId) {
    return (
      <motion.div
        layoutId={layoutId}
        transition={{
          layout: {
            duration: 0.42,
            ease: [0.22, 1, 0.36, 1],
          },
        }}
        className="w-full"
      >
        {composerContent}
      </motion.div>
    )
  }

  return <div className="w-full">{composerContent}</div>
}
