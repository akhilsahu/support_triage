import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'

interface EmailOtpFormProps {
  email: string
  onSubmit: (code: string) => void
  onResend: () => void
  onChangeEmail: () => void
  loading?: boolean
  errorMessage?: string
}

export function EmailOtpForm({
  email,
  onSubmit,
  onResend,
  onChangeEmail,
  loading,
  errorMessage,
}: EmailOtpFormProps) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''))
  const [resendTimer, setResendTimer] = useState(30)
  const [shake, setShake] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (resendTimer <= 0) return
    const interval = setInterval(() => {
      setResendTimer((prev) => prev - 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [resendTimer])

  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  useEffect(() => {
    if (errorMessage) {
      setShake(true)
      const timer = setTimeout(() => setShake(false), 300)
      setVerifying(false)
      return () => clearTimeout(timer)
    }
  }, [errorMessage])

  const handleDigitChange = (index: number, value: string) => {
    const clean = value.replace(/\D/g, '')
    if (!clean) {
      const newDigits = [...digits]
      newDigits[index] = ''
      setDigits(newDigits)
      return
    }

    const newDigits = [...digits]
    if (clean.length > 1) {
      const pasted = clean.slice(0, 6).split('')
      pasted.forEach((ch, idx) => {
        if (index + idx < 6) newDigits[index + idx] = ch
      })
      setDigits(newDigits)
      const nextIdx = Math.min(index + pasted.length, 5)
      inputRefs.current[nextIdx]?.focus()
    } else {
      newDigits[index] = clean[0]
      setDigits(newDigits)
      if (index < 5) {
        inputRefs.current[index + 1]?.focus()
      }
    }

    const codeString = newDigits.join('')
    if (codeString.length === 6 && !newDigits.includes('')) {
      setVerifying(true)
      onSubmit(codeString)
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pastedData) return

    const newDigits = Array(6).fill('')
    pastedData.split('').forEach((ch, idx) => {
      newDigits[idx] = ch
    })
    setDigits(newDigits)

    const nextIdx = Math.min(pastedData.length, 5)
    inputRefs.current[nextIdx]?.focus()

    if (pastedData.length === 6) {
      setVerifying(true)
      onSubmit(pastedData)
    }
  }

  const handleResendClick = () => {
    if (resendTimer > 0) return
    setResendTimer(30)
    setDigits(Array(6).fill(''))
    inputRefs.current[0]?.focus()
    onResend()
  }

  const isSubmitting = loading || verifying

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#0B1220] tracking-tight" style={{ fontFamily: 'Satoshi, sans-serif' }}>
          Check your email
        </h2>
        <p className="mt-1 text-sm text-slate-500 font-normal">
          We sent a 6-digit code to <span className="font-semibold text-slate-800">{email}</span>
        </p>
      </div>

      <motion.div
        animate={shake ? { x: [0, -3, 3, -2, 2, 0] } : {}}
        transition={{ duration: 0.25 }}
        className="flex items-center justify-between gap-2"
      >
        {digits.map((digit, idx) => (
          <input
            key={idx}
            ref={(el) => { inputRefs.current[idx] = el }}
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={digit}
            onChange={(e) => handleDigitChange(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            onPaste={handlePaste}
            disabled={isSubmitting}
            className={`w-12 h-14 text-center text-xl font-bold text-[#0B1220] rounded-[12px] bg-white border transition-all duration-150 outline-none ${
              errorMessage
                ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-100'
                : 'border-[#E3E8EF] focus:border-[#8DCBFF] focus:ring-4 focus:ring-[#4DB4FF]/10'
            }`}
          />
        ))}
      </motion.div>

      {errorMessage && (
        <p className="text-xs font-medium text-red-500 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {errorMessage}
        </p>
      )}

      {isSubmitting && (
        <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-500 py-1">
          <svg className="animate-spin h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Verifying code…</span>
        </div>
      )}

      <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={handleResendClick}
          disabled={resendTimer > 0 || isSubmitting}
          className={`font-semibold transition-colors ${
            resendTimer > 0
              ? 'text-slate-400 cursor-not-allowed'
              : 'text-blue-600 hover:text-blue-800'
          }`}
        >
          {resendTimer > 0 ? `Resend code in ${resendTimer}s` : 'Resend code'}
        </button>

        <button
          type="button"
          onClick={onChangeEmail}
          disabled={isSubmitting}
          className="text-slate-500 hover:text-[#0B1220] transition-colors font-medium"
        >
          Change email
        </button>
      </div>
    </div>
  )
}
