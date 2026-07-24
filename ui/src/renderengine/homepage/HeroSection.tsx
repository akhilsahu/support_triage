import type { SectionProps } from './types'

// Lead intro line for the pre-chat welcome. The big logo + "Hi there" greeting
// were dropped to save vertical space -- the brand logo and name already sit in
// the widget header, so the welcome opens straight into the assistant's intro.
export function HeroSection({ theme: t, space }: SectionProps) {
  const intro = space?.description
    ? `I'm ${space.name}'s assistant. ${space.description}`
    : 'How can we help you today?'
  return (
    <div className="flex flex-col items-center text-center">
      <p className={`text-[14px] leading-snug line-clamp-3 max-w-md ${t.textSecondary}`}>{intro}</p>
    </div>
  )
}
