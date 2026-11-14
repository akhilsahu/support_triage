import { labelize } from '../../presentation/presets'
import type { SpacePresentationConfig } from '../../presentation/schema'

const backgrounds: SpacePresentationConfig['backgroundTreatment'][] = ['soft', 'light', 'dark', 'image']

export function BackgroundPicker({ value, imageEnabled, imageLabel, onChange }: { value: SpacePresentationConfig['backgroundTreatment']; imageEnabled: boolean; imageLabel?: string; onChange: (value: SpacePresentationConfig['backgroundTreatment']) => void }) {
  return (
    <div className="appearance-backgrounds" role="radiogroup" aria-label="Background treatment">
      {backgrounds.map((background) => (
        <button key={background} role="radio" aria-checked={value === background} disabled={background === 'image' && !imageEnabled} onClick={() => onChange(background)}>
          <span className={`background-sample sample-${background}`} aria-hidden="true" />
          {background === 'image' && imageLabel ? imageLabel : labelize(background)}
        </button>
      ))}
    </div>
  )
}
