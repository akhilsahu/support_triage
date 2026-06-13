import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Mail, Lock, Building2, AtSign, Eye, EyeOff, ArrowRight, Home } from 'lucide-react'
import { IMAGES } from '../../../config/images.config'
import { useAppStore } from '../../../store/useAppStore'

const API = '/api/v1'
type Tab = 'login' | 'register'

function InputField({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  icon: Icon,
  hint,
  required,
  tooltip,
}: {
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  icon: React.ElementType
  hint?: string
  required?: boolean
  tooltip?: string
}) {
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  const inputType = isPassword && show ? 'text' : type

  return (
    <div className="group space-y-1">
      <div className="flex justify-between items-baseline px-1">
        <div className="flex items-center gap-1.5">
          <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700">
            {label}
          </label>
          {tooltip && (
            <div className="relative flex items-center group/tooltip">
              <span className="cursor-help p-0.5 text-slate-400 hover:text-amber-700 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                </svg>
              </span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-3 bg-white border border-slate-200 text-xs text-slate-600 rounded-xl shadow-lg opacity-0 scale-90 pointer-events-none group-hover/tooltip:opacity-100 group-hover/tooltip:scale-100 transition-all duration-250 z-50 text-center font-semibold normal-case leading-normal tracking-normal">
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 border-4 border-transparent border-t-white" />
                {tooltip}
              </div>
            </div>
          )}
        </div>
        {hint && (
          <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
            {hint}
          </span>
        )}
      </div>
      <div className="relative flex items-center">
        <div className="absolute left-4 flex items-center justify-center pointer-events-none">
          <Icon className="w-4 h-4 text-slate-450 group-focus-within:text-amber-600 transition-colors duration-300" />
        </div>
        <input
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className="w-full pl-11 pr-11 py-2.5 text-sm bg-white border border-amber-200/60 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/5 transition-all duration-300 ease-out font-semibold"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-4 p-0.5 text-slate-400 hover:text-slate-700 transition-colors duration-200"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  )
}

export function Login3() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setAuth } = useAppStore()
  const [tab, setTab] = useState<Tab>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Login inputs
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Register inputs
  const [slug, setSlug] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    const tabParam = searchParams.get('tab')
    if (tabParam === 'register' || tabParam === 'signup') {
      setTab('register')
    } else {
      setTab('login')
    }
  }, [location.search])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Login failed')
      setAuth(data.token, data.space?.id || '', data.space?.slug || '', data.space?.display_name || '')
      navigate('/app/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!slug || !displayName || !regEmail || !regPassword) {
      setError('All fields are required.')
      return
    }
    if (regPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: slug.trim().toLowerCase(),
          display_name: displayName.trim(),
          email: regEmail.trim(),
          password: regPassword,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Registration failed')
      setAuth(data.token, data.space?.id || '', data.space?.slug || '', data.space?.display_name || '')
      navigate('/app/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-[#FAF7F0] text-slate-800"
      style={{ fontFamily: "'Satoshi', 'Google Sans', Inter, system-ui, sans-serif" }}
    >
      {/* Floating Home Back Button */}
      <div className="absolute top-6 left-6 z-20">
        <Link
          to="/"
          className="p-2.5 rounded-xl border border-amber-250/40 text-slate-500 hover:text-slate-900 transition-all duration-200"
          title="Back to home"
        >
          <Home className="w-4 h-4" />
        </Link>
      </div>

      {/* Flat card-less alignment. No box frames, completely flat on beigish backdrop */}
      <div className="w-full max-w-[360px] mx-auto transition-all duration-300 relative z-10">

        {/* Brand Area */}
        <div className="flex flex-col items-center mb-5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-r from-amber-600 via-rose-500 to-pink-500 p-0.5 shadow-sm flex items-center justify-center mb-3">
            <div className="w-full h-full bg-white rounded-xl p-2.5 flex items-center justify-center">
              <img 
                src={IMAGES.logo} 
                alt="Logo" 
                className="w-full h-full rounded-xl object-cover" 
              />
            </div>
          </div>
          
          <h2 className="text-xl font-black text-slate-900 tracking-tight text-center">
            {tab === 'login' ? 'Sign In to Your Space' : 'Create Your Custom Space'}
          </h2>
          
          <p className="text-xs text-slate-500 mt-1 font-semibold text-center leading-relaxed">
            {tab === 'login' ? 'Access your support dashboard' : 'Get your custom URL link in under 5 seconds'}
          </p>
        </div>

        {/* Flat Tab Switcher */}
        <div className="flex bg-slate-200/50 p-1 rounded-xl gap-1 mb-5 max-w-[190px] mx-auto border border-amber-200/10">
          {(['login', 'register'] as Tab[]).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => { setTab(tabKey); setError('') }}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold tracking-wide transition-all duration-300 ${
                tab === tabKey
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {tabKey === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        {/* Error Alert Block */}
        {error && (
          <div className="mb-4 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold leading-relaxed animate-fadeIn">
            {error}
          </div>
        )}

        {/* Forms */}
        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4 animate-fadeIn">
            <InputField
              label="Your Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="name@company.com"
              icon={Mail}
              required
            />
            <InputField
              label="Your Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              icon={Lock}
              required
            />

            <div className="flex justify-end px-1">
              <Link
                to="/app/forgot-password"
                className="text-xs text-amber-600 hover:text-rose-500 font-semibold transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-amber-600 via-rose-500 to-pink-500 text-white font-extrabold text-xs uppercase tracking-widest py-3.5 px-6 rounded-xl shadow-md hover:opacity-95 active:scale-[0.97] transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none mt-3"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Connecting…</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3.5 animate-fadeIn">
            <InputField
              label="Space URL Name"
              type="text"
              value={slug}
              onChange={setSlug}
              placeholder="acme-corp"
              icon={AtSign}
              hint="(URL name)"
              required
              tooltip="Unique text name for your custom direct link (e.g. support247.chat/acme-corp)."
            />
            <InputField
              label="Space Display Name"
              type="text"
              value={displayName}
              onChange={setDisplayName}
              placeholder="Acme Corp"
              icon={Building2}
              required
              tooltip="The display title customers see at the top of your custom page."
            />
            <InputField
              label="Your Email"
              type="email"
              value={regEmail}
              onChange={setRegEmail}
              placeholder="name@company.com"
              icon={Mail}
              required
              tooltip="Used to log in and manage your details."
            />
            <InputField
              label="Your Password"
              type="password"
              value={regPassword}
              onChange={setRegPassword}
              placeholder="Min. 8 characters"
              icon={Lock}
              required
              tooltip="Please choose a safe password with 8 characters minimum."
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-amber-600 via-rose-500 to-pink-500 text-white font-extrabold text-xs uppercase tracking-widest py-3.5 px-6 rounded-xl shadow-md hover:opacity-95 active:scale-[0.97] transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none mt-5"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Creating Space…</span>
                </>
              ) : (
                <>
                  <span>Create Space</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Tab switcher link */}
        <div className="mt-5 pt-4 border-t border-amber-200/20 text-center">
          <p className="text-xs text-slate-500 font-semibold leading-relaxed">
            {tab === 'login' ? (
              <>
                New to the platform?{' '}
                <button
                  type="button"
                  onClick={() => { setTab('register'); setError('') }}
                  className="text-rose-500 font-extrabold hover:underline transition-colors focus:outline-none"
                >
                  Create space
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setTab('login'); setError('') }}
                  className="text-rose-500 font-extrabold hover:underline transition-colors focus:outline-none"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>

        {/* Copyright */}
        <p className="mt-6 text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">
          © {new Date().getFullYear()} SUPPORT247.chat
        </p>

      </div>

    </div>
  )
}
