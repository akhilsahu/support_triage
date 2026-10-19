import { AlignLeft, AlignCenter, AlignRight, StretchHorizontal } from 'lucide-react'
import type { SpacePresentationConfig } from '../../presentation/schema'

type ContentLayout = NonNullable<SpacePresentationConfig['contentLayout']>

interface LayoutOption {
  id: ContentLayout
  label: string
  icon: typeof AlignLeft
}

const LAYOUT_OPTIONS: LayoutOption[] = [
  { id: 'left', label: 'Left', icon: AlignLeft },
  { id: 'center', label: 'Center', icon: AlignCenter },
  { id: 'right', label: 'Right', icon: AlignRight },
  { id: 'stretch', label: 'Stretch', icon: StretchHorizontal },
]

export function ContentLayoutPicker({
  value = 'center',
  onChange,
}: {
  value?: ContentLayout
  onChange: (value: ContentLayout) => void
}) {
  return (
    <div className="appearance-layout-picker" role="radiogroup" aria-label="Content layout">
      {LAYOUT_OPTIONS.map((option) => {
        const Icon = option.icon
        const isChecked = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isChecked}
            onClick={() => onChange(option.id)}
            title={`Align main window content to ${option.label.toLowerCase()}`}
            aria-label={`${option.label} content layout`}
          >
            <Icon size={16} />
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
