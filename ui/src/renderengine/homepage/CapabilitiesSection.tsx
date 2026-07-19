import { Sparkles } from 'lucide-react'
import type { SectionProps } from './types'
import { SectionHeading } from './SectionHeading'

// "What this bot can help with" -- derived deterministically from the
// chatbot's active agents (see app/renderengine/capabilities.py, no LLM
// call). Renders nothing until populated -- safe no-op, same as before this
// was wired up.
export function CapabilitiesSection({ theme: t, capabilities }: SectionProps) {
  if (!capabilities?.length) return null
  return (
    <div className="flex flex-col items-center w-full">
      <SectionHeading theme={t}>How I can help</SectionHeading>
      <div className="flex flex-wrap justify-center gap-2 max-w-md w-full">
        {capabilities.map((capability, i) => (
          <span
            key={i}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-[13px] font-medium ${t.chipCls} ${t.textPrimary}`}
          >
            <Sparkles className="w-3.5 h-3.5 flex-shrink-0 text-indigo-400" />
            {capability}
          </span>
        ))}
      </div>
    </div>
  )
}
