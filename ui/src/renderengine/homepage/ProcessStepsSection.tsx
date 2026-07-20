import type { SectionProps } from './types'
import { SectionHeading } from './SectionHeading'

// "How it works" numbered journey (see app/renderengine/process_steps.py).
// Renders nothing until the backend sends processSteps -- safe no-op.
export function ProcessStepsSection({ theme: t, processSteps }: SectionProps) {
  if (!processSteps?.steps?.length) return null
  return (
    <div className="flex flex-col items-center w-full">
      <SectionHeading theme={t}>{processSteps.title}</SectionHeading>
      <div className="flex gap-2.5 max-w-lg w-full">
        {processSteps.steps.map((step, i) => (
          <div key={i} className={`flex-1 rounded-xl border px-2.5 py-3 text-center ${t.chipCls}`}>
            <div className="w-6 h-6 rounded-full mx-auto mb-1.5 flex items-center justify-center text-[12px] font-semibold bg-indigo-500/15 text-indigo-400">
              {i + 1}
            </div>
            <p className={`text-[12.5px] font-medium ${t.textPrimary}`}>{step.label}</p>
            {step.body && <p className={`text-[11px] mt-0.5 leading-snug ${t.textSecondary}`}>{step.body}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
