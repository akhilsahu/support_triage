import type { ReactNode } from 'react'
import type { SectionTheme } from './types'

// Small centered label that sits above a section's content, so the pre-chat
// page reads as distinct, labelled groups ("How I can help", "Highlights",
// "Frequently asked") instead of one undifferentiated wall of chips.
export function SectionHeading({ theme: t, children }: { theme: SectionTheme; children: ReactNode }) {
  return (
    <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] mb-2.5 ${t.textMuted}`}>
      {children}
    </p>
  )
}
