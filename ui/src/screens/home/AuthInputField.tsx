import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export interface AuthInputTheme {
  labelClass: string
  labelPx: string
  hintClass: string
  tooltipHoverClass: string
  iconFocusClass: string
  inputClass: string
  tooltipBoxClass: string
  tooltipArrowBorder: string
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
  theme: AuthInputTheme
}

export function AuthInputField({
  label, type = 'text', value, onChange, placeholder,
  icon: Icon, hint, required, tooltip, theme,
}: Props) {
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  const inputType = isPassword && show ? 'text' : type

  return (
    <div className="group space-y-1.5">
      <div className={`flex justify-between items-baseline ${theme.labelPx}`}>
        <div className="flex items-center gap-1.5">
          <label className={`block ${theme.labelClass}`}>{label}</label>
          {tooltip && (
            <div className="relative flex items-center group/tooltip">
              <span className={`cursor-help p-0.5 text-slate-500 ${theme.tooltipHoverClass} transition-colors`}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                </svg>
              </span>
              <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-3 text-xs opacity-0 scale-90 pointer-events-none group-hover/tooltip:opacity-100 group-hover/tooltip:scale-100 transition-all duration-200 z-50 text-center font-medium normal-case leading-normal tracking-normal backdrop-blur-md ${theme.tooltipBoxClass}`}>
                <div className={`absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 border-4 border-transparent ${theme.tooltipArrowBorder}`} />
                {tooltip}
              </div>
            </div>
          )}
        </div>
        {hint && <span className={theme.hintClass}>{hint}</span>}
      </div>
      <div className="relative flex items-center">
        <div className="absolute left-4 flex items-center justify-center pointer-events-none">
          <Icon className={`w-4 h-4 text-slate-500 ${theme.iconFocusClass} transition-colors duration-300`} />
        </div>
        <input
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className={`w-full pl-11 pr-11 py-2.5 text-sm focus:outline-none transition-all duration-300 ease-out ${theme.inputClass}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="absolute right-4 p-0.5 text-slate-500 hover:text-slate-250 transition-colors duration-200"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  )
}
