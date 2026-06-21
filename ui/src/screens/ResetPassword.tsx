import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Lock, Eye, EyeOff, ArrowRight, Home, ArrowLeft, CheckCircle } from 'lucide-react'
import { usePublicTheme } from './StaticPage'
import { API_CONFIG } from '@/config/api'

const API = `${API_CONFIG.baseURL}/api/v1`

export function ResetPassword() {
  const t = usePublicTheme()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [showCf, setShowCf]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [success, setSuccess]   = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    if (!token) setError('Invalid or missing reset token. Please request a new link.')
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm)  { setError('Passwords do not match.'); return }

    setLoading(true)
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Reset failed')
      setSuccess(true)
      setTimeout(() => navigate('/app/login'), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-start p-6 pt-24 pb-12 relative overflow-y-auto ${t.page}`}
      style={{ fontFamily: t.font }}
    >
      {/* Glow effects */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className={`absolute top-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full blur-[140px] ${t.authGlow1}`} />
        <div className={`absolute bottom-[-10%] right-[-10%] w-[550px] h-[550px] rounded-full blur-[120px] ${t.authGlow2}`} />
      </div>

      {/* Home button */}
      <div className="absolute top-6 left-6 z-20">
        <Link
          to="/"
          className={`p-2.5 rounded-full shadow-sm transition-all duration-200 backdrop-blur-md focus:outline-none ${t.authHomeBtn}`}
          title="Back to home"
        >
          <Home className="w-4 h-4" />
        </Link>
      </div>

      <div className={`w-full max-w-[390px] rounded-[36px] p-6 md:p-8 shadow-[0_30px_70px_rgba(0,0,0,0.3)] backdrop-blur-3xl relative z-10 mt-6 mb-4 ${t.authCard}`}>

        <Link
          to="/app/login"
          className={`inline-flex items-center gap-1.5 text-xs font-semibold mb-6 transition-colors ${t.authBackLink}`}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Sign In
        </Link>

        <div className="flex flex-col items-center mb-6">
          <div className={`w-12 h-12 rounded-full ${t.authIconBg} flex items-center justify-center mb-3`}>
            <Lock className="w-5 h-5 text-white" />
          </div>
          <h1 className={`text-lg font-bold ${t.prose.replace('text-slate-300', 'text-white').replace('text-slate-600', 'text-slate-900')}`}>Set a new password</h1>
          <p className={`text-xs mt-1.5 text-center leading-relaxed font-medium ${t.subtitle}`}>
            Choose a strong password for your account.
          </p>
        </div>

        {success ? (
          <div className="text-center space-y-4">
            <div className="flex flex-col items-center gap-2">
              <CheckCircle className="w-10 h-10 text-emerald-500" />
              <p className={`text-sm font-bold ${t.h1.replace('text-4xl font-bold ', '').replace(' mb-3 tracking-tight', '')}`}>Password updated!</p>
            </div>
            <div className="px-4 py-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-semibold leading-relaxed">
              Redirecting you to Sign In…
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 px-4 py-2.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold leading-relaxed">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className={`block text-xs font-bold tracking-wider px-4 ${t.authLabelText}`}>
                  New Password
                </label>
                <div className="relative flex items-center">
                  <Lock className="absolute left-4 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    className={`w-full pl-11 pr-11 py-2.5 text-sm rounded-full focus:outline-none transition-all duration-300 font-medium ${t.authInput}`}
                  />
                  <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-4 text-slate-400 hover:text-slate-600 transition-colors">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={`block text-xs font-bold tracking-wider px-4 ${t.authLabelText}`}>
                  Confirm Password
                </label>
                <div className="relative flex items-center">
                  <Lock className="absolute left-4 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type={showCf ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat your password"
                    required
                    className={`w-full pl-11 pr-11 py-2.5 text-sm rounded-full focus:outline-none transition-all duration-300 font-medium ${t.authInput}`}
                  />
                  <button type="button" onClick={() => setShowCf(s => !s)} className="absolute right-4 text-slate-400 hover:text-slate-600 transition-colors">
                    {showCf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !token}
                className={`w-full font-bold py-3 px-6 rounded-full active:scale-[0.97] transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none mt-2 text-sm ${t.authBtn}`}
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Saving…</span>
                  </>
                ) : (
                  <>
                    <span>Update Password</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>

      <p className={`absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-semibold tracking-wider ${t.authCopyright}`}>
        © {new Date().getFullYear()} SUPPORT247.chat
      </p>
    </div>
  )
}
