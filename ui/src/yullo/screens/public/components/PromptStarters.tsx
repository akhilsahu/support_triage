import { motion } from 'motion/react'

interface PromptStartersProps {
  prompts?: string[]
  onSelect: (prompt: string) => void
  align?: 'left' | 'center' | 'right' | 'stretch'
}

export function PromptStarters({ prompts, onSelect, align = 'center' }: PromptStartersProps) {
  if (!prompts || prompts.length === 0) return null

  const isLeft = align === 'left'
  const isRight = align === 'right'
  const isStretch = align === 'stretch'

  const containerAlign = isLeft
    ? 'items-start text-left self-start mr-auto'
    : isRight
    ? 'items-end text-right self-end ml-auto'
    : isStretch
    ? 'items-start text-left self-stretch w-full'
    : 'items-center text-center self-center mx-auto'

  const buttonJustify = isLeft
    ? 'justify-start'
    : isRight
    ? 'justify-end'
    : isStretch
    ? 'justify-start w-full'
    : 'justify-center'

  return (
    <motion.div 
      className={`flex flex-col ${containerAlign} mt-12 mb-8 space-y-6 w-full px-4`}
      style={{ maxWidth: 'var(--presentation-content-width)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.16 }}
    >
      <div className="text-sm font-medium tracking-wide text-[var(--presentation-muted)]">
        What can I help you find?
      </div>
      
      <div className={`flex flex-wrap ${buttonJustify} gap-3 ${isStretch ? 'w-full' : 'max-w-[820px]'}`}>
        {prompts.map((prompt, i) => (
          <button
            key={i}
            onClick={() => onSelect(prompt)}
            className="min-h-12 whitespace-nowrap rounded-xl border border-[var(--presentation-border)] bg-[var(--presentation-surface)] px-5 py-2.5 font-medium text-[var(--presentation-text)] transition-colors hover:border-[var(--presentation-accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--presentation-accent-soft)]"
          >
            {prompt}
          </button>
        ))}
      </div>
    </motion.div>
  )
}
