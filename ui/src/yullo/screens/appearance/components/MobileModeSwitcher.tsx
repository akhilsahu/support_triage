export type MobileMode = 'preview' | 'customize'

export function MobileModeSwitcher({ value, onChange }: { value: MobileMode; onChange: (value: MobileMode) => void }) {
  return (
    <div className="appearance-mobile-modes" role="tablist" aria-label="Appearance mode">
      <button role="tab" aria-selected={value === 'preview'} onClick={() => onChange('preview')}>Preview</button>
      <button role="tab" aria-selected={value === 'customize'} onClick={() => onChange('customize')}>Customize</button>
    </div>
  )
}
