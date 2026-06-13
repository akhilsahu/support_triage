import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Lock, Eye, EyeOff, ArrowRight, Home, ArrowLeft, CheckCircle } from 'lucide-react'

const API = '/api/v1'

export function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [showCf, setShowCf]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const [success, setSuccess]     = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    if (!token) setError('Invalid or missing reset token. Please request a new link.')
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

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
      className="min-h-screen flex flex-col items-center justify-start p-6 pt-24 pb-12 bg-[#0d0f1c] relative overflow-y-auto text-slate-100"
      style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', Inter, system-ui, sans-serif" }}
    >
      {/* Glow effects */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[550px] h-[550px] bg-violet-500/10 rounded-full blur-[120px]" />
      </div>

      {/* Home button */}
      <div className="absolute top-6 left-6 z-20">
        <Link
          to="/"
          className="p-2.5 rounded-full bg-[#181b28]/60 border border-white/10 shadow-sm text-slate-400 hover:text-white transition-all duration-200 backdrop-blur-md focus:outline-none"
          title="Back to home"
        >
          <Home className="w-4 h-4" />
        </Link>
      </div>

      <div className="w-full max-w-[390px] bg-[#181b28]/50 border border-white/10 rounded-[36px] p-6 md:p-8 shadow-[0_30px_70px_rgba(0,0,0,0.5)] backdrop-blur-3xl relative z-10 mt-6 mb-4">

        <Link
          to="/app/login"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 font-semibold mb-6 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Sign In
        </Link>

        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center mb-3 shadow-lg shadow-indigo-500/20">
            <Lock className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-white">Set a new password</h1>
          <p className="text-xs text-slate-400 mt-1.5 text-center leading-relaxed font-medium">
            Choose a strong password for your account.
          </p>
        </div>

        {success ? (
          <div className="text-center space-y-4">
            <div className="flex flex-col items-center gap-2">
              <CheckCircle className="w-10 h-10 text-emerald-400" />
              <p className="text-sm font-bold text-white">Password updated!</p>
            </div>
            <div className="px-4 py-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold leading-relaxed">
              Redirecting you to Sign In…
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 px-4 py-2.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold leading-relaxed">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* New password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold tracking-wider text-slate-350 px-4">
                  New Password
                </label>
                <div className="relative flex items-center">
                  <Lock className="absolute left-4 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    className="w-full pl-11 pr-11 py-2.5 text-sm bg-[#181b28] border border-white/10 rounded-full text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 shadow-[0_4px_15px_rgba(0,0,0,0.2)] transition-all duration-300 font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(s => !s)}
                    className="absolute right-4 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold tracking-wider text-slate-350 px-4">
                  Confirm Password
                </label>
                <div className="relative flex items-center">
                  <Lock className="absolute left-4 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type={showCf ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat your password"
                    required
                    className="w-full pl-11 pr-11 py-2.5 text-sm bg-[#181b28] border border-white/10 rounded-full text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 shadow-[0_4px_15px_rgba(0,0,0,0.2)] transition-all duration-300 font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCf(s => !s)}
                    className="absolute right-4 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showCf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !token}
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-3 px-6 rounded-full shadow-lg shadow-indigo-500/20 hover:shadow-xl active:scale-[0.97] transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none mt-2 text-sm"
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

      <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-slate-600 font-semibold tracking-wider">
        © {new Date().getFullYear()} SUPPORT247.chat
      </p>
    </div>
  )
}
