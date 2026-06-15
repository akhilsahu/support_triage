import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Mail, CheckCircle, XCircle, Loader2, Home } from 'lucide-react'
import { usePublicTheme } from './StaticPage'

const API = '/api/v1'

export function VerifyEmail() {
  const t = usePublicTheme()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

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

      <div className={`relative z-10 w-full max-w-md rounded-2xl p-10 shadow-2xl backdrop-blur-md text-center ${t.authCard}`}>

        {/* No token — "check your inbox" state */}
        {!token && (
          <>
            <div className="flex justify-center mb-6">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${t.authGlow1} border ${t.cardBg.replace('bg-', 'border-')}`}>
                <Mail className={`w-8 h-8 ${t.accentLink.replace(' hover:underline', '')}`} />
              </div>
            </div>
            <h1 className={`text-2xl font-bold mb-3 ${t.h1.replace('text-4xl', 'text-2xl').replace(' mb-3 tracking-tight', '')}`}>Check your email</h1>
            <p className={`text-sm leading-relaxed mb-8 ${t.subtitle}`}>
              We've sent a verification link to your email address.<br />
              Click the link to activate your account and log in.
            </p>
            <p className={`text-xs ${t.prose}`}>
              Didn't receive it? Check your spam folder, or{' '}
              <Link to="/app/login?tab=register" className={t.accentLink}>
                register again
              </Link>
              .
            </p>
          </>
        )}

        {/* Verifying */}
        {token && status === 'verifying' && (
          <>
            <div className="flex justify-center mb-6">
              <Loader2 className={`w-12 h-12 animate-spin ${t.accentLink.replace(' hover:underline', '')}`} />
            </div>
            <h1 className={`text-2xl font-bold mb-3 ${t.h1.replace('text-4xl', 'text-2xl').replace(' mb-3 tracking-tight', '')}`}>Verifying your email…</h1>
            <p className={`text-sm ${t.subtitle}`}>Just a moment.</p>
          </>
        )}

        {/* Success */}
        {token && status === 'success' && (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </div>
            </div>
            <h1 className={`text-2xl font-bold mb-3 ${t.h1.replace('text-4xl', 'text-2xl').replace(' mb-3 tracking-tight', '')}`}>Email verified!</h1>
            <p className={`text-sm mb-8 ${t.subtitle}`}>
              Your account is active. You can now log in.
            </p>
            <Link
              to="/app/login"
              className={`inline-flex items-center gap-2 font-semibold text-sm px-7 py-3 rounded-xl transition-all ${t.authBtn}`}
            >
              Go to Login
            </Link>
          </>
        )}

        {/* Error */}
        {token && status === 'error' && (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center">
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
            </div>
            <h1 className={`text-2xl font-bold mb-3 ${t.h1.replace('text-4xl', 'text-2xl').replace(' mb-3 tracking-tight', '')}`}>Verification failed</h1>
            <p className={`text-sm mb-8 ${t.subtitle}`}>{error}</p>
            <Link
              to="/app/login?tab=register"
              className={`inline-flex items-center gap-2 font-semibold text-sm px-7 py-3 rounded-xl transition-all ${t.authBtn}`}
            >
              Back to Register
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
