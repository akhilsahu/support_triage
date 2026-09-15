import { useState, useId } from 'react'
import { motion } from 'framer-motion'

const COUNTRY_CODES = [
  { code: '+91', country: 'India', flag: '🇮🇳' },
  { code: '+1', country: 'US / Canada', flag: '🇺🇸' },
  { code: '+44', country: 'United Kingdom', flag: '🇬🇧' },
  { code: '+49', country: 'Germany', flag: '🇩🇪' },
  { code: '+61', country: 'Australia', flag: '🇦🇺' },
  { code: '+81', country: 'Japan', flag: '🇯🇵' },
  { code: '+33', country: 'France', flag: '🇫🇷' },
  { code: '+971', country: 'UAE', flag: '🇦🇪' },
  { code: '+65', country: 'Singapore', flag: '🇸🇬' },
]

interface PhoneFormProps {
  onSubmit: (data: { phone: string; countryCode: string }) => void
  onSwitchToEmail: () => void
  loading?: boolean
  errorMessage?: string
}

export function PhoneForm({ onSubmit, onSwitchToEmail, loading, errorMessage }: PhoneFormProps) {
  const [countryCode, setCountryCode] = useState('+91')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [localError, setLocalError] = useState('')
  const [shake, setShake] = useState(false)
  const inputId = useId()

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d\s-]/g, '')
    setPhoneNumber(raw)
    if (localError) setLocalError('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const digitsOnly = phoneNumber.replace(/\D/g, '')

    if (!digitsOnly || digitsOnly.length < 7 || digitsOnly.length > 15) {
      setLocalError('Enter a valid phone number.')
      triggerShake()
      return
    }

    onSubmit({ phone: digitsOnly, countryCode })
  }

  const triggerShake = () => {
    setShake(true)
    setTimeout(() => setShake(false), 300)
  }

  const activeError = localError || errorMessage

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor={inputId} className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
          Phone number
        </label>

        <motion.div
          animate={shake ? { x: [0, -3, 3, -2, 2, 0] } : {}}
          transition={{ duration: 0.25 }}
          className={`relative flex items-center h-[52px] rounded-[14px] bg-white border transition-all duration-150 ${
            activeError
              ? 'border-red-400 focus-within:border-red-500 focus-within:ring-4 focus-within:ring-red-100'
              : 'border-[#E3E8EF] focus-within:border-[#8DCBFF] focus-within:ring-4 focus-within:ring-[#4DB4FF]/10'
          }`}
        >
          {/* Country Dial Code Dropdown */}
          <div className="relative flex items-center h-full border-r border-[#E3E8EF] bg-slate-50/50 rounded-l-[14px] px-3">
            <select
              aria-label="Country code"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className="bg-transparent text-sm font-semibold text-[#0B1220] cursor-pointer outline-none pr-4 py-2 appearance-none z-10"
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.code} ({c.country})
                </option>
              ))}
            </select>
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
              ▼
            </span>
          </div>

          {/* Number Input */}
          <input
            id={inputId}
            type="tel"
            value={phoneNumber}
            onChange={handlePhoneChange}
            placeholder="98765 43210"
            disabled={loading}
            className="w-full h-full bg-transparent px-4 text-[#0B1220] font-medium text-base outline-none placeholder:text-slate-400"
          />
        </motion.div>

        {/* Inline Error */}
        {activeError && (
          <p className="mt-2 text-xs font-medium text-red-500 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {activeError}
          </p>
        )}
      </div>

      {/* Main CTA */}
      <button
        type="submit"
        disabled={loading || !phoneNumber.trim()}
        className="w-full h-[52px] rounded-[14px] bg-[#0B1220] text-white font-medium text-[15px] flex items-center justify-center gap-2 transition-all duration-150 hover:bg-[#152033] hover:-translate-y-[1px] active:translate-y-0 disabled:bg-slate-100 disabled:text-slate-400 disabled:border disabled:border-slate-200/80 disabled:hover:translate-y-0 disabled:cursor-not-allowed shadow-none"
      >
        {loading ? (
          <span className="flex items-center gap-2 text-slate-500 font-normal">
            <svg className="animate-spin h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Sending code…
          </span>
        ) : (
          <span>Continue</span>
        )}
      </button>

      {/* Email Fallback Link */}
      <div className="pt-1 text-center">
        <button
          type="button"
          onClick={onSwitchToEmail}
          className="text-xs font-medium text-slate-500 hover:text-[#0B1220] transition-colors py-1 px-2 rounded-md hover:bg-slate-100/60"
        >
          Use email instead
        </button>
      </div>
    </form>
  )
}
