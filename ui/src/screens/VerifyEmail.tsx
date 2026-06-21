import { useState, useEffect } from 'react'
import { Link, useSearchParams, useLocation } from 'react-router-dom'
import { Mail, CheckCircle, XCircle, Loader2, Home, RefreshCw } from 'lucide-react'
import { usePublicTheme } from './StaticPage'
import { API_CONFIG } from '@/config/api'

const API = `${API_CONFIG.baseURL}/api/v1`

export function VerifyEmail() {
  const t = usePublicTheme()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const location = useLocation()
  const emailFromState = (location.state as { email?: string } | null)?.email ?? ''

  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  // Resend state — pre-filled with email from registration flow
  const [resendEmail, setResendEmail] = useState(emailFromState)
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  useEffect(() => {
    if (!token) return
    setStatus('verifying')
    fetch(`${API}/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (res.ok) {
          setStatus('success')
        } else {
          const data = await res.json().catch(() => ({}))
          setError(data.detail || 'Verification failed. The link may have expired.')
          setStatus('error')
        }
      })
      .catch(() => {
        setError('Network error. Please try again.')
        setStatus('error')
      })
  }, [token])

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resendEmail.trim()) return
    setResendStatus('sending')
    try {
      await fetch(`${API}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail.trim() }),
      })
      setResendStatus('sent')
    } catch {
      setResendStatus('error')
    }
  }

  const resendForm = (
    <div className={`rounded-xl p-5 text-left ${t.cardBg}`}>
      <p className={`text-sm font-semibold mb-3 ${t.prose}`}>Didn't receive it?</p>
      {resendStatus === 'sent' ? (
        <div className="flex items-center gap-2 text-emerald-500 text-sm font-semibold">
          <CheckCircle className="w-4 h-4" />
          New link sent — check your inbox.
        </div>
      ) : (
        <form onSubmit={handleResend} className="flex gap-2">
          <input
            type="email"
            value={resendEmail}
            onChange={e => !emailFromState && setResendEmail(e.target.value)}
            placeholder="Enter your email"
            readOnly={!!emailFromState}
            required
            className={`flex-1 px-4 py-2.5 text-sm rounded-xl focus:outline-none transition-all ${t.authInput} ${emailFromState ? 'cursor-default select-none opacity-80' : ''}`}
          />
          <button
            type="submit"
            disabled={resendStatus === 'sending'}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1.5 disabled:opacity-50 transition-all ${t.authBtn}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${resendStatus === 'sending' ? 'animate-spin' : ''}`} />
            Resend
          </button>
        </form>
      )}
      {resendStatus === 'error' && (
        <p className="text-xs text-red-500 mt-2">Something went wrong. Try again.</p>
      )}
      <p className={`text-xs mt-3 ${t.prose} opacity-60`}>Also check your spam / junk folder.</p>
    </div>
  )

  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-center p-6 relative ${t.page}`}
      style={{ fontFamily: t.font }}
    >
      {/* Glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className={`absolute top-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full blur-[140px] ${t.authGlow1}`} />
        <div className={`absolute bottom-[-10%] right-[-10%] w-[550px] h-[550px] rounded-full blur-[120px] ${t.authGlow2}`} />
      </div>

      <div className="absolute top-6 left-6 z-20">
        <Link
          to="/"
          className={`p-2.5 rounded-full shadow-sm transition-all duration-200 backdrop-blur-md ${t.authHomeBtn}`}
          title="Back to home"
        >
          <Home className="w-4 h-4" />
        </Link>
      </div>

      <div className={`relative z-10 w-full max-w-lg rounded-2xl p-10 shadow-2xl backdrop-blur-md text-center ${t.authCard}`}>

        {/* No token — "check your inbox" state */}
        {!token && (
          <>
            <div className="flex justify-center mb-7">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center ${t.authGlow1} border ${t.cardBg.replace('bg-', 'border-')}`}>
                <Mail className={`w-10 h-10 ${t.accentLink.replace(' hover:underline', '')}`} />
              </div>
            </div>
            <h1 className={`text-3xl font-bold mb-4 ${t.h1.replace('text-4xl', 'text-3xl').replace(' mb-3 tracking-tight', '')}`}>
              Check your email
            </h1>
            <p className={`text-base leading-relaxed mb-10 ${t.subtitle}`}>
              We've sent a verification link to your email address.<br />
              Click the link to activate your account and log in.
            </p>

            {resendForm}
          </>
        )}

        {/* Verifying */}
        {token && status === 'verifying' && (
          <>
            <div className="flex justify-center mb-7">
              <Loader2 className={`w-14 h-14 animate-spin ${t.accentLink.replace(' hover:underline', '')}`} />
            </div>
            <h1 className={`text-3xl font-bold mb-4 ${t.h1.replace('text-4xl', 'text-3xl').replace(' mb-3 tracking-tight', '')}`}>
              Verifying your email…
            </h1>
            <p className={`text-base ${t.subtitle}`}>Just a moment.</p>
          </>
        )}

        {/* Success */}
        {token && status === 'success' && (
          <>
            <div className="flex justify-center mb-7">
              <div className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-emerald-500" />
              </div>
            </div>
            <h1 className={`text-3xl font-bold mb-4 ${t.h1.replace('text-4xl', 'text-3xl').replace(' mb-3 tracking-tight', '')}`}>
              Email verified!
            </h1>
            <p className={`text-base mb-10 ${t.subtitle}`}>
              Your account is active. You can now log in.
            </p>
            <Link
              to="/app/login"
              className={`inline-flex items-center gap-2 font-bold text-base px-8 py-3.5 rounded-xl transition-all ${t.authBtn}`}
            >
              Go to Login
            </Link>
          </>
        )}

        {/* Error */}
        {token && status === 'error' && (
          <>
            <div className="flex justify-center mb-7">
              <div className="w-20 h-20 rounded-full bg-red-500/15 flex items-center justify-center">
                <XCircle className="w-10 h-10 text-red-500" />
              </div>
            </div>
            <h1 className={`text-3xl font-bold mb-4 ${t.h1.replace('text-4xl', 'text-3xl').replace(' mb-3 tracking-tight', '')}`}>
              Verification failed
            </h1>
            <p className={`text-base mb-8 ${t.subtitle}`}>{error}</p>

            <div className="mb-6">{resendForm}</div>

            <Link
              to="/app/login?tab=register"
              className={`inline-flex items-center gap-2 font-semibold text-sm ${t.accentLink}`}
            >
              Back to Register
            </Link>
          </>
        )}
      </div>

      <p className={`absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-semibold tracking-wider ${t.authCopyright}`}>
        © {new Date().getFullYear()} SUPPORT247.chat
      </p>
    </div>
  )
}
