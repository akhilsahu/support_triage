import type { SectionProps } from './types'
import { SectionHeading } from './SectionHeading'

// Admin-authored quick-topic buttons (see app/renderengine/quick_topics.py).
// Not AI-generated -- same treatment as PromoSection. Clicking a topic sends
// its configured prompt as the first message, same mechanism as suggestion chips.
export function QuickTopicsSection({ theme: t, quickTopics, onSend }: SectionProps) {
  if (!quickTopics?.length) return null
  return (
    <div className="flex flex-col items-center w-full">
      <SectionHeading theme={t}>Popular topics</SectionHeading>
      <div className="flex flex-wrap justify-center gap-2.5 max-w-xl w-full">
        {quickTopics.map((topic, i) => (
          <button
            key={i}
            onClick={() => onSend(topic.prompt)}
            className={`px-4 py-2.5 rounded-full border text-[13.5px] font-medium
                        transition-all duration-200 active:scale-95 shadow-sm
                        ${t.chipCls} ${t.chipHoverCls}`}
          >
            {topic.label}
          </button>
        ))}
      </div>
    </div>
  )
}
