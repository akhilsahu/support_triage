import type { SpacePresentationConfig } from '../../presentation/schema'

const accents: SpacePresentationConfig['accent'][] = ['yullo', 'blue', 'cyan', 'violet', 'coral', 'forest', 'neutral']

export function AccentPicker({ value, onChange }: { value: SpacePresentationConfig['accent']; onChange: (value: SpacePresentationConfig['accent']) => void }) {
  return (
    <div className="appearance-swatches" role="radiogroup" aria-label="Accent color">
      {accents.map((accent) => (
        <button key={accent} role="radio" aria-checked={value === accent} data-accent-choice={accent} onClick={() => onChange(accent)} aria-label={`${accent} accent`}><span /></button>
      ))}
    </div>
  )
}
