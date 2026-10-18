import { useState } from 'react'

interface GoogleAuthButtonProps {
  onSuccess: (data: { google_sub: string; email: string; name?: string }) => void
  onError: (msg: string) => void
  loading?: boolean
}

export function GoogleAuthButton({ onSuccess, onError, loading }: GoogleAuthButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleGoogleClick = () => {
    if (loading || isSubmitting) return
    setIsSubmitting(true)

    // Simulate standard Google Identity Services / OIDC popup flow
    setTimeout(() => {
      try {
        // Mock standard Google authentication credential payload for test environment
        const mockGoogleUser = {
          google_sub: 'google_109283746591029384756',
          email: 'alex.creator@yullo.co',
          name: 'Alex Creator',
        }
        onSuccess(mockGoogleUser)
      } catch (err: any) {
        onError(err?.message || 'Google sign-in failed. Please try again.')
      } finally {
        setIsSubmitting(false)
      }
    }, 600)
  }

  const isLoading = loading || isSubmitting

  return (
    <button
      type="button"
      onClick={handleGoogleClick}
      disabled={isLoading}
      className="w-full h-[52px] border-transparent border-transparent-[#E3E8EF] rounded-[14px] bg-white text-[#0B1220] font-medium text-[15px] flex items-center justify-center gap-3 transition-all duration-150 hover:bg-[#FAFBFC] hover:border-transparent-[#D6DCE5] hover:-translate-y-[1px] active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed shadow-none bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
    >
      {isLoading ? (
        <span className="flex items-center gap-2 text-slate-500 font-normal">
          <svg className="animate-spin h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Connecting to Google…
        </span>
      ) : (
        <>
          {/* Standard 4-color Google G icon */}
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.25 21.3 7.31 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.17 0 9.99 0 12s.46 3.83 1.26 5.42l4.02-3.15z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.94 1.19 15.23 0 12 0 7.31 0 3.25 2.7 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
            />
          </svg>
          <span>Continue with Google</span>
        </>
      )}
    </button>
  )
}
