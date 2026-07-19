import type { SectionProps } from './types'
import { SectionHeading } from './SectionHeading'

// AI-generated FAQ, grounded in this bot's actual knowledge base content
// (see app/renderengine/faq.py). Renders nothing when there's no usable KB
// content to ground answers in -- same safe no-op as the original stub.
// Uses native <details>/<summary> for the expand/collapse -- no extra state.
export function FaqSection({ theme: t, faq }: SectionProps) {
  if (!faq?.length) return null
  return (
    <div className="flex flex-col items-center w-full">
      <SectionHeading theme={t}>Frequently asked</SectionHeading>
      <div className="flex flex-col gap-2 max-w-lg w-full text-left">
        {faq.map((item, i) => (
          <details
            key={i}
            className={`group rounded-xl border px-4 py-3 ${t.chipCls} [&_summary]:cursor-pointer [&_summary]:list-none [&::-webkit-details-marker]:hidden`}
          >
            <summary className={`flex items-center justify-between gap-3 text-[13.5px] font-medium ${t.textPrimary}`}>
              {item.question}
              <span className={`flex-shrink-0 transition-transform group-open:rotate-45 ${t.textMuted}`}>+</span>
            </summary>
            <p className={`text-[13px] leading-relaxed mt-2 ${t.textSecondary}`}>{item.answer}</p>
          </details>
        ))}
      </div>
    </div>
  )
}
