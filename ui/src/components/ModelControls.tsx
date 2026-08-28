import { REASONING_EFFORTS, INHERIT } from '../lib/llm'

export interface ModelEffort {
  model: string | null   // null = inherit (chatbot default / server default)
  effort: string | null  // null = inherit; '' = off; low|medium|high
}

const inputCls =
  'w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white placeholder-gray-400'

// Model + reasoning-effort pickers. "Inherit" (null) falls through to the next
// level up: agent → chatbot → server env config (LLM_MODEL / REASONING_EFFORT).
// "Off" is a real "no reasoning" override even when a higher level has it on.
export function ModelControls({
  value,
  inheritLabel,
  onChange,
  disabled,
  showModel = true,
}: {
  value: ModelEffort
  inheritLabel: string
  onChange: (v: ModelEffort) => void
  disabled?: boolean
  showModel?: boolean
}) {
  return (
    <div className="space-y-3">
      {showModel && (
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Model
          </label>
          <input
            type="text"
            value={value.model ?? ''}
            disabled={disabled}
            onChange={e => onChange({ ...value, model: e.target.value.trim() || null })}
            placeholder="e.g. openai/gpt-4o-mini (blank = system default)"
            className={`${inputCls} font-mono`}
          />
          <p className="text-xs text-gray-400 mt-1">
            Provider-prefixed model id served through OpenRouter. Blank uses the system default from config.
          </p>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Reasoning effort
        </label>
        <select
          value={value.effort == null ? INHERIT : value.effort}
          disabled={disabled}
          onChange={e => {
            const v = e.target.value
            onChange({ ...value, effort: v === INHERIT ? null : v })
          }}
          className={inputCls}
        >
          <option value={INHERIT}>{inheritLabel}</option>
          {REASONING_EFFORTS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1">
          Off forces no reasoning even if the chatbot or config default has it on.
        </p>
      </div>
    </div>
  )
}
