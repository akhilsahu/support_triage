import type { SectionProps } from './types'

// Extracted as-is from CustomerChat.tsx's original suggestion-chip row --
// same data source (existing /api/chat/{slug}/suggestions fetch), unchanged.
export function SuggestedQuestionsSection({ theme: t, suggestions, onSend }: SectionProps) {
  if (!suggestions.length) return null
  return (
    <div className="flex flex-col items-center text-center">
      <p className={`text-[12px] mb-2 ${t.textMuted}`}>Pick a question below or type your own.</p>
      <div className="flex flex-wrap justify-center gap-2 max-w-xl w-full">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSend(s)}
            className={`px-3.5 py-2 rounded-full border text-[13px] font-medium
                        transition-all duration-200 active:scale-95 shadow-sm
                        ${t.chipCls} ${t.chipHoverCls}`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
