import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '../../components/ui/Input'

// We keep AuthInputTheme for backward compatibility if it's passed,
// but we largely ignore it in favor of the new universal Input styles.
export interface AuthInputTheme {
  labelClass?: string
  labelPx?: string
  hintClass?: string
  tooltipHoverClass?: string
  iconFocusClass?: string
  inputClass?: string
  tooltipBoxClass?: string
  tooltipArrowBorder?: string
}

interface Props {
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  icon: React.ElementType
  hint?: string
  required?: boolean
  tooltip?: string
  theme?: AuthInputTheme
}

export function AuthInputField({
  label, type = 'text', value, onChange, placeholder,
  icon: Icon, hint, required, tooltip
}: Props) {
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  const inputType = isPassword && show ? 'text' : type

  return (
    <Input
      label={label}
      type={inputType}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      hint={hint || tooltip} // Tooltip can be used as a hint in the new design
      leftIcon={Icon}
      rightIcon={isPassword ? (show ? EyeOff : Eye) : undefined}
      onRightIconClick={isPassword ? () => setShow(!show) : undefined}
    />
  )
}
