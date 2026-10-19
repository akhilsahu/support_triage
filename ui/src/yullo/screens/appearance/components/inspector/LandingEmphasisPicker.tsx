import { PURPOSE_EMPHASIS, labelize, type SpacePurpose } from '../../presentation/presets'
import type { SpacePresentationConfig } from '../../presentation/schema'

export function LandingEmphasisPicker({ purpose, value, onChange }: { purpose: SpacePurpose; value: SpacePresentationConfig['landingEmphasis']; onChange: (value: SpacePresentationConfig['landingEmphasis']) => void }) {
  return (
    <div className="appearance-choice-row" role="radiogroup" aria-label="Landing emphasis">
      {PURPOSE_EMPHASIS[purpose].map((option) => <button key={option} role="radio" aria-checked={value === option} onClick={() => onChange(option)}>{labelize(option)}</button>)}
    </div>
  )
}
