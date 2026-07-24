import type { SectionProps } from './types'
import { SectionHeading } from './SectionHeading'

// Competitor comparison table (see app/renderengine/comparison.py). Admin-curated
// grids are verified (no disclaimer); AI/web grids show an illustrative disclaimer.
// First row is highlighted as "this brand". Renders nothing when unset.
export function ComparisonSection({ theme: t, comparison }: SectionProps) {
  if (!comparison?.columns?.length || !comparison?.rows?.length) return null
  return (
    <div className="flex flex-col items-center w-full">
      <SectionHeading theme={t}>How we compare</SectionHeading>
      <div className={`max-w-lg w-full rounded-2xl border overflow-hidden ${t.chipCls}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] border-collapse">
            <thead>
              <tr>
                {comparison.columns.map((col, i) => (
                  <th key={i} className={`text-left font-medium px-3 py-1.5 whitespace-nowrap
                                          ${i === 0 ? '' : 'text-right'} ${t.textSecondary}`}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row, ri) => (
                <tr key={ri} className={`border-t border-current/10 ${ri === 0 ? 'bg-indigo-500/[0.06]' : ''}`}>
                  {row.map((cell, ci) => (
                    <td key={ci} className={`px-3 py-1.5 whitespace-nowrap
                                             ${ci === 0 ? 'font-medium' : 'text-right'}
                                             ${ri === 0 ? t.textPrimary : t.textSecondary}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {(comparison.source || (comparison.illustrative && comparison.disclaimer)) && (
        <p className={`text-[11px] italic mt-2 max-w-lg ${t.textMuted}`}>
          {comparison.source && <span>Source: {comparison.source}. </span>}
          {comparison.illustrative && comparison.disclaimer}
        </p>
      )}
    </div>
  )
}
