import { useState } from 'react'
import { motion } from 'motion/react'
import { yulloOnboardingApi } from '../../api/onboarding'
import { DraftSpace } from './YulloOnboarding'
import { User, Briefcase, Building, Globe } from 'lucide-react'

const PURPOSES = [
  { id: 'personal', title: 'Personal Space', desc: 'A place for your own thoughts, projects, and AI.', icon: User },
  { id: 'work', title: 'Work & Professional', desc: 'For your portfolio, resume, and professional presence.', icon: Briefcase },
  { id: 'business', title: 'Business', desc: 'Engage customers, provide support, and share updates.', icon: Building },
  { id: 'organization', title: 'Community / Organization', desc: 'A hub for your group, open source project, or club.', icon: Globe },
]

export function ChooseStep({ token, onContinue, draft }: { token: string, onContinue: (d: DraftSpace) => void, draft?: DraftSpace | null }) {
  const [selected, setSelected] = useState<string | null>(draft?.purpose || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleContinue = async () => {
    if (!selected) return
    setLoading(true)
    setError(null)
    try {
      const draft = await yulloOnboardingApi.createDraft(selected, token)
      onContinue(draft)
    } catch (err: any) {
      setError(err.message || 'Failed to create space.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-10 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 mb-3">
          What will you create?
        </h1>
        <p className="text-gray-500 text-lg">
          Every Space starts with an intention. How will you use Yullo?
        </p>
      </div>

      <div className="space-y-3 mb-10">
        {PURPOSES.map((p) => {
          const Icon = p.icon
          const isSelected = selected === p.id
          
          return (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={`w-full flex items-center gap-4 p-5 rounded-2xl text-left transition-all duration-200 border ${
                isSelected 
                  ? 'border-[#FFFC00] bg-[#FFFC00]/10 shadow-sm' 
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                isSelected ? 'bg-[#FFFC00]/20 text-[#b3b100]' : 'bg-gray-100 text-gray-400'
              }`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <div className={`font-semibold text-lg mb-0.5 ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                  {p.title}
                </div>
                <div className="text-gray-500 text-sm leading-relaxed">
                  {p.desc}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-600 text-sm border border-red-100">
          {error}
        </div>
      )}

      <div className="flex justify-center">
        <button
          onClick={handleContinue}
          disabled={!selected || loading}
          className="bg-gray-900 hover:bg-[var(--accent-solid)] text-[var(--accent-on-solid)] px-8 py-3.5 rounded-full font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : null}
          Continue
        </button>
      </div>
    </div>
  )
}
