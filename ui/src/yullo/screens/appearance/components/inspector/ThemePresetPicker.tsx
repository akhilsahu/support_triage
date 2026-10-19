import { PURPOSE_PRESETS, labelize, type SpacePurpose } from '../../presentation/presets'
import type { SpacePresentationConfig } from '../../presentation/schema'

export function ThemePresetPicker({ purpose, value, onChange }: { purpose: SpacePurpose; value: SpacePresentationConfig['themePreset']; onChange: (value: SpacePresentationConfig['themePreset']) => void }) {
  return (
    <div className="appearance-preset-grid" role="radiogroup" aria-label="Theme preset">
      {PURPOSE_PRESETS[purpose].map((preset) => (
        <button key={preset} role="radio" aria-checked={value === preset} className="appearance-preset" onClick={() => onChange(preset)}>
          <span className={`appearance-preset-mini preset-${preset}`} aria-hidden="true"><i /><b /><em /></span>
          <span>{labelize(preset)}</span>
          {value === preset && <span className="appearance-selected-dot" aria-hidden="true" />}
        </button>
      ))}
    </div>
  )
}
