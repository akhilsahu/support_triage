import { FormEvent, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import type { AppearanceCandidate } from '../../../../api/appearance'
import type { SpacePresentationConfig } from '../../presentation/schema'
import { useAppearanceAura } from '../../hooks/useAppearanceAura'
import { AuraAppearanceMessage } from './AuraAppearanceMessage'
import { AuraSuggestionChips } from './AuraSuggestionChips'

export function AppearanceAuraDesigner({ spaceId, config, onApply }: { spaceId: string; config: SpacePresentationConfig; onApply: (candidate: AppearanceCandidate) => void }) {
  const [instruction, setInstruction] = useState('')
  const [message, setMessage] = useState('')
  const aura = useAppearanceAura(spaceId, config)

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    const value = instruction.trim()
    if (!value) return
    try {
      const candidate = await aura.command.mutateAsync(value)
      onApply(candidate)
      setMessage(candidate.explanation)
      setInstruction('')
    } catch {
      setMessage("Couldn't create a suggestion. Your current appearance is unchanged.")
    }
  }

  const recommend = async () => {
    try {
      const candidate = await aura.recommendation.mutateAsync()
      onApply(candidate)
      setMessage(candidate.explanation)
    } catch {
      setMessage("Couldn't create a recommendation. Your current appearance is unchanged.")
    }
  }

  return (
    <div className="appearance-aura">
      <p className="text-sm text-[var(--text-secondary)]">Tell Aura how you want this Space to feel.</p>
      <button type="button" className="appearance-aura-recommend" onClick={recommend} disabled={aura.recommendation.isPending}>{aura.recommendation.isPending ? 'Thinking…' : 'Recommend an appearance'}</button>
      <AuraSuggestionChips onSelect={setInstruction} />
      {message && <AuraAppearanceMessage>{message}</AuraAppearanceMessage>}
      <form onSubmit={submit} className="appearance-aura-input">
        <input value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Ask Aura to change it…" maxLength={500} aria-label="Appearance instruction" />
        <button type="submit" disabled={!instruction.trim() || aura.command.isPending} aria-label="Send appearance instruction"><ArrowUp size={18} /></button>
      </form>
    </div>
  )
}
