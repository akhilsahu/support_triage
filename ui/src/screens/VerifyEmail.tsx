import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Mail, CheckCircle, XCircle, Loader2, Home } from 'lucide-react'

const API = '/api/v1'

export function VerifyEmail() {
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
      className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0d0f1c] text-slate-100"
      style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', Inter, system-ui, sans-serif" }}
    >
      {/* Glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[550px] h-[550px] bg-violet-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="absolute top-6 left-6 z-20">
        <Link
          to="/"
          className="p-2.5 rounded-full bg-[#181b28]/60 border border-white/10 shadow-sm text-slate-400 hover:text-white transition-all duration-200 backdrop-blur-md"
          title="Back to home"
        >
          <Home className="w-4 h-4" />
        </Link>
      </div>

      <div className="relative z-10 w-full max-w-md bg-[#13162a]/80 border border-white/10 rounded-2xl p-10 shadow-2xl backdrop-blur-md text-center">

        {/* No token — "check your inbox" state */}
        {!token && (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-full bg-indigo-500/15 flex items-center justify-center">
                <Mail className="w-8 h-8 text-indigo-400" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">Check your email</h1>
            <p className="text-slate-400 text-sm leading-relaxed mb-8">
              We've sent a verification link to your email address.<br />
              Click the link to activate your account and log in.
            </p>
            <p className="text-slate-500 text-xs">
              Didn't receive it? Check your spam folder, or{' '}
              <Link to="/app/login?tab=register" className="text-indigo-400 hover:text-indigo-300 underline">
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
              <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">Verifying your email…</h1>
            <p className="text-slate-400 text-sm">Just a moment.</p>
          </>
        )}

        {/* Success */}
        {token && status === 'success' && (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">Email verified!</h1>
            <p className="text-slate-400 text-sm mb-8">
              Your account is active. You can now log in.
            </p>
            <Link
              to="/app/login"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm px-7 py-3 rounded-xl transition-colors"
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
                <XCircle className="w-8 h-8 text-red-400" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">Verification failed</h1>
            <p className="text-slate-400 text-sm mb-8">{error}</p>
            <Link
              to="/app/login?tab=register"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm px-7 py-3 rounded-xl transition-colors"
            >
              Back to Register
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
