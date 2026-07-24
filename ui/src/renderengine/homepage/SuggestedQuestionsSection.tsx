import type { SectionProps } from './types'

// Suggested starter questions as a single compact horizontal strip -- chips sit
// on one line and scroll sideways if they overflow, so the section stays short
// instead of stacking into several full-width rows. Same data source and
// onSend behaviour as before.
export function SuggestedQuestionsSection({ theme: t, suggestions, onSend }: SectionProps) {
  if (!suggestions.length) return null
  return (
    <div className="flex flex-col items-center w-full">
      <p className={`text-[12px] mb-2 ${t.textMuted}`}>Pick a question below or type your own.</p>
      <div className="flex gap-2 w-full overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSend(s)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full border text-[12.5px] font-medium
                        whitespace-nowrap transition-all duration-200 active:scale-95
                        ${t.chipCls} ${t.chipHoverCls}`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
