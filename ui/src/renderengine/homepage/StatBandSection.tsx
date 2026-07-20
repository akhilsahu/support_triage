import type { SectionProps } from './types'
import { SectionHeading } from './SectionHeading'

// Trust-metrics band (see app/renderengine/stat_band.py). Big headline numbers
// a prospect scans first. Illustrative -- always shows the disclaimer.
export function StatBandSection({ theme: t, statBand }: SectionProps) {
  if (!statBand?.stats?.length) return null
  return (
    <div className="flex flex-col items-center w-full">
      <SectionHeading theme={t}>Trusted by millions</SectionHeading>
      <div className="grid grid-cols-2 gap-2.5 max-w-md w-full">
        {statBand.stats.map((s, i) => (
          <div key={i} className={`rounded-xl border px-3.5 py-3 text-left ${t.chipCls}`}>
            <p className={`text-[22px] font-semibold leading-tight ${t.textPrimary}`}>{s.value}</p>
            <p className={`text-[12px] mt-0.5 ${t.textSecondary}`}>{s.label}</p>
          </div>
        ))}
      </div>
      <p className={`text-[11px] italic mt-2 max-w-md ${t.textMuted}`}>{statBand.disclaimer}</p>
    </div>
  )
}
