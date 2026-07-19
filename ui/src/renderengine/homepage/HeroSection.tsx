import { Sparkles } from 'lucide-react'
import type { SectionProps } from './types'

// Extracted as-is from CustomerChat.tsx's original hardcoded empty-state
// block -- this is the guaranteed-safe fallback section, always safe to
// show first regardless of what else the AI/admin picks.
export function HeroSection({ theme: t, space }: SectionProps) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative mb-6">
        {space?.logo_url ? (
          <img
            src={space.logo_url}
            alt={space.name}
            className="w-20 h-20 rounded-3xl object-cover shadow-2xl shadow-indigo-500/20 mx-auto ring-1 ring-white/10"
          />
        ) : (
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-2xl shadow-indigo-500/30 mx-auto">
            <Sparkles className="w-9 h-9 text-white" />
          </div>
        )}
        <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-emerald-400 flex items-center justify-center ring-2 ring-white/10 shadow-md">
          <span className="w-2 h-2 rounded-full bg-white animate-ping" />
        </span>
      </div>
      <h1 className={`text-[28px] font-semibold mb-1.5 ${t.textPrimary}`} style={{ letterSpacing: '-0.02em' }}>
        Hi there 👋
      </h1>
      <p className={`text-[15px] ${t.textSecondary}`}>
        {space?.description
          ? `I'm ${space.name}'s assistant. ${space.description}`
          : `How can we help you today?`}
      </p>
    </div>
  )
}
