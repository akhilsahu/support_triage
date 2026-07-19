import type { SectionProps } from './types'

// Admin-authored only -- never AI-generated (see app/renderengine/homepage_sections.py,
// where "promo" is excluded from the AI-selectable pool). Renders nothing unless
// an admin has explicitly set section_overrides.promo via ChatbotProfile.
export function PromoSection({ theme: t, overrides }: SectionProps) {
  const text = overrides?.promo?.text
  if (!text) return null
  // Add a hair of space after a leading emoji so it doesn't jam the text.
  const display = text.replace(/^(\p{Extended_Pictographic}️?)(?=\S)/u, '$1 ')
  return (
    <div className={`max-w-md text-center text-[14px] font-medium px-4 py-3 rounded-xl border border-indigo-400/30 bg-indigo-500/10 ${t.textPrimary}`}>
      {display}
    </div>
  )
}
