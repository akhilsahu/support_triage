import { useState, useId } from 'react'
import { motion } from 'framer-motion'

interface EmailFormProps {
  onSubmit: (email: string) => void
  onSwitchToPhone: () => void
  loading?: boolean
  errorMessage?: string
}

export function EmailForm({ onSubmit, onSwitchToPhone, loading, errorMessage }: EmailFormProps) {
  const [email, setEmail] = useState('')
  const [localError, setLocalError] = useState('')
  const [shake, setShake] = useState(false)
  const inputId = useId()

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value)
    if (localError) setLocalError('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const clean = email.trim().toLowerCase()

    if (!clean || !clean.includes('@') || !clean.includes('.')) {
      setLocalError('Enter a valid email address.')
      triggerShake()
      return
    }

    onSubmit(clean)
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
          Email address
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
          <input
            id={inputId}
            type="email"
            value={email}
            onChange={handleEmailChange}
            placeholder="name@company.com"
            disabled={loading}
            className="w-full h-full bg-transparent px-4 text-[#0B1220] font-medium text-base outline-none placeholder:text-slate-400"
          />
        </motion.div>

        {activeError && (
          <p className="mt-2 text-xs font-medium text-red-500 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {activeError}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || !email.trim()}
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
          <span>Send sign-in code</span>
        )}
      </button>

      <div className="pt-1.5 text-center">
        <button
          type="button"
          onClick={onSwitchToPhone}
          className="text-sm font-medium text-slate-700 hover:text-[#0B1220] transition-colors py-1 px-2.5 rounded-md hover:bg-slate-100/80"
        >
          Use phone instead
        </button>
      </div>
    </form>
  )
}
