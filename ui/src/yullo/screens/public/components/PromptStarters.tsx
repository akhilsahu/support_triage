import { motion } from 'framer-motion'

interface PromptStartersProps {
  prompts?: string[]
  onSelect: (prompt: string) => void
}

export function PromptStarters({ prompts, onSelect }: PromptStartersProps) {
  if (!prompts || prompts.length === 0) return null

  return (
    <motion.div 
      className="flex flex-col items-center mt-12 mb-8 space-y-6 w-full px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.16 }}
    >
      <div className="text-gray-400 font-medium text-sm tracking-wide uppercase">
        What can I help you find?
      </div>
      
      <div className="flex flex-wrap justify-center gap-3 max-w-[820px]">
        {prompts.map((prompt, i) => (
          <button
            key={i}
            onClick={() => onSelect(prompt)}
            className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50/50 rounded-xl transition-all shadow-sm font-medium whitespace-nowrap"
          >
            {prompt}
          </button>
        ))}
      </div>
    </motion.div>
  )
}
