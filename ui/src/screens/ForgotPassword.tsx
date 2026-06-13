import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, ArrowRight, Home, ArrowLeft } from 'lucide-react'

const API = '/api/v1'

export function ForgotPassword() {
  const [email, setEmail]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Request failed')
      }
      setSubmitted(true)
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

        {/* Back to login */}
        <Link
          to="/app/login"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 font-semibold mb-6 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Sign In
        </Link>

        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center mb-3 shadow-lg shadow-indigo-500/20">
            <Mail className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-white">Forgot your password?</h1>
          <p className="text-xs text-slate-400 mt-1.5 text-center leading-relaxed font-medium">
            Enter your email and we'll send you a reset link.
          </p>
        </div>

        {submitted ? (
          <div className="text-center space-y-4">
            <div className="px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold leading-relaxed">
              Check your inbox — if that email is registered, a reset link is on its way.
            </div>
            <Link
              to="/app/login"
              className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:underline font-bold mt-2"
            >
              <ArrowLeft className="w-3 h-3" />
              Return to Sign In
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 px-4 py-2.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold leading-relaxed">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold tracking-wider text-slate-350 px-4">
                  Email
                </label>
                <div className="relative flex items-center">
                  <Mail className="absolute left-4 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    required
                    className="w-full pl-11 pr-4 py-2.5 text-sm bg-[#181b28] border border-white/10 rounded-full text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 shadow-[0_4px_15px_rgba(0,0,0,0.2)] transition-all duration-300 font-medium"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-3 px-6 rounded-full shadow-lg shadow-indigo-500/20 hover:shadow-xl active:scale-[0.97] transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none mt-2 text-sm"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Sending…</span>
                  </>
                ) : (
                  <>
                    <span>Send Reset Link</span>
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
