import { Check } from 'lucide-react'
import type { SectionProps } from './types'
import { SectionHeading } from './SectionHeading'

// AI-generated benefit bullets (see app/renderengine/key_benefits.py).
// Renders nothing until the backend sends keyBenefits -- safe no-op if the
// content generation failed or hasn't populated yet.
export function KeyBenefitsSection({ theme: t, keyBenefits }: SectionProps) {
  if (!keyBenefits?.length) return null
  return (
    <div className="flex flex-col items-center w-full">
      <SectionHeading theme={t}>Highlights</SectionHeading>
      <div className="flex flex-col gap-1.5 max-w-md w-full text-left">
        {keyBenefits.map((benefit, i) => (
          <div key={i} className={`flex items-center gap-2.5 rounded-xl border px-3 py-1.5 ${t.chipCls}`}>
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
              <Check className="w-3 h-3" />
            </span>
            <span className={`text-[13px] font-medium ${t.textPrimary}`}>{benefit}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
