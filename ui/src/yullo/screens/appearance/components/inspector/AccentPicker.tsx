import type { SpacePresentationConfig } from '../../presentation/schema'

const accents: SpacePresentationConfig['accent'][] = ['yullo', 'blue', 'cyan', 'violet', 'coral', 'forest', 'neutral']

export function AccentPicker({ value, customColor, onChange, onCustomColor }: { value: SpacePresentationConfig['accent']; customColor?: string | null; onChange: (value: SpacePresentationConfig['accent']) => void; onCustomColor: (value: string) => void }) {
  return (
    <div>
    <div className="appearance-swatches" role="radiogroup" aria-label="Accent color">
      {accents.map((accent) => (
        <button key={accent} role="radio" aria-checked={!customColor && value === accent} data-accent-choice={accent} onClick={() => onChange(accent)} aria-label={`${accent} accent`}><span /></button>
      ))}
    </div>
    <label className="mt-3 flex items-center gap-3 text-xs text-[var(--text-secondary)]">
      <input type="color" value={customColor || '#FFFC00'} onChange={event => onCustomColor(event.target.value)} className="h-8 w-9 cursor-pointer rounded border border-[var(--border)] bg-[var(--surface)]" />
      {customColor ? `Custom ${customColor.toUpperCase()}` : 'Choose a custom color'}
    </label>
    </div>
  )
}
