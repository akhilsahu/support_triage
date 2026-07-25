import type { SectionProps } from './types'

// Suggested starter questions as a 2-column grid -- chips sit side by side and
// wrap onto new rows, so several fit compactly without a tall single-column
// stack or a horizontal scroll. Text is left-aligned and wraps inside each
// card since the questions are often too long for a one-line pill. Same data
// source and onSend behaviour as before.
export function SuggestedQuestionsSection({ theme: t, suggestions, onSend }: SectionProps) {
  if (!suggestions.length) return null
  return (
    <div className="flex flex-col items-center w-full">
      <p className={`text-[12px] mb-2 ${t.textMuted}`}>Pick a question below or type your own.</p>
      <div className="grid grid-cols-2 gap-2 w-full">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSend(s)}
            className={`text-left px-3 py-2 rounded-xl border text-[12.5px] font-medium leading-snug
                        transition-all duration-200 active:scale-95 ${t.chipCls} ${t.chipHoverCls}`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
