import { ShieldCheck } from 'lucide-react'
import type { SectionProps } from './types'
import { SectionHeading } from './SectionHeading'

// Admin-authored trust badges (see app/renderengine/trust_badges.py). Not
// AI-generated -- same treatment as QuickTopicsSection/PromoSection. Static,
// non-interactive -- visually distinct from the clickable quick-topic chips.
export function TrustBadgesSection({ theme: t, trustBadges }: SectionProps) {
  if (!trustBadges?.length) return null
  return (
    <div className="flex flex-col items-center w-full">
      <SectionHeading theme={t}>Why trust us</SectionHeading>
      <div className="flex flex-wrap justify-center gap-2.5 max-w-lg w-full">
        {trustBadges.map((badge, i) => (
          <span
            key={i}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-[13px] font-semibold ${t.chipCls} ${t.textPrimary}`}
          >
            <ShieldCheck className="w-4 h-4 flex-shrink-0 text-emerald-500" />
            {badge}
          </span>
        ))}
      </div>
    </div>
  )
}
