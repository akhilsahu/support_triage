import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Lock, Building2, AtSign, Eye, EyeOff, ArrowRight, Sun, Moon } from 'lucide-react'
import { IMAGES } from '../config/images.config'
import { useAppStore } from '../store/useAppStore'
import { theme, t } from '../config/theme.config'

const API = '/api/v1'
type Tab = 'login' | 'register'

// ── Input field ───────────────────────────────────────────────────────────────

function InputField({
  label, type: initialType, value, onChange, placeholder,
  icon: Icon, hint, required, isDark,
}: {
  label: string; type: string; value: string
  onChange: (v: string) => void; placeholder: string
  icon: React.ElementType; hint?: string; required?: boolean; isDark: boolean
}) {
  const [show, setShow] = useState(false)
  const isPassword = initialType === 'password'
  const type = isPassword && show ? 'text' : initialType

  return (
    <div>
      <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${t(theme.label, isDark)}`}>
        {label}
        {hint && <span className="ml-1 font-normal normal-case tracking-normal opacity-60">{hint}</span>}
      </label>
      <div className="relative">
        <Icon className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${t(theme.input.icon, isDark)}`} />
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className={`w-full pl-10 pr-10 py-2.5 text-sm border rounded-xl outline-none transition-all
            ${t(theme.input.bg, isDark)} ${t(theme.input.border, isDark)}
            ${t(theme.input.text, isDark)} ${t(theme.input.placeholder, isDark)}
            ${theme.input.focusRing} focus:ring-2`}
        />
        {isPassword && (
          <button type="button" onClick={() => setShow(s => !s)}
            className={`absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors ${t(theme.input.icon, isDark)} hover:opacity-80`}>
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function Login() {
  const navigate = useNavigate()
  const { setAuth, isDark, toggleTheme } = useAppStore()
  const [tab, setTab] = useState<Tab>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [slug, setSlug] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Login failed')
      setAuth(data.token, data.org?.id || '', data.org?.slug || '', data.org?.display_name || '')
      navigate('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally { setLoading(false) }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault(); setError('')
    if (!slug || !displayName || !regEmail || !regPassword) { setError('All fields are required.'); return }
    setLoading(true)
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, display_name: displayName, email: regEmail, password: regPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Registration failed')
      setAuth(data.token, data.org?.id || '', data.org?.slug || '', data.org?.display_name || '')
      navigate('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally { setLoading(false) }
  }

  const inputProps = { isDark }

  return (
    <div className="min-h-screen flex transition-colors duration-300">

      {/* ── Left: gradient brand panel ──────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col relative overflow-hidden"
        style={{ background: isDark
          ? 'linear-gradient(135deg, #0f0f1a 0%, #1e1b4b 40%, #312e81 75%, #4338ca 100%)'
          : 'linear-gradient(135deg, #1e1b4b 0%, #3730a3 40%, #6d28d9 75%, #7c3aed 100%)' }}>

        {/* Orbs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-80px] left-[-80px] w-[400px] h-[400px] rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #818cf8, transparent)' }} />
          <div className="absolute bottom-[-60px] right-[-60px] w-[350px] h-[350px] rounded-full opacity-15"
            style={{ background: 'radial-gradient(circle, #c4b5fd, transparent)' }} />
        </div>

        {/* Grid */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }} />

        <div className="relative z-10 flex flex-col justify-between h-full p-12">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-9 h-9 rounded-xl object-cover shadow-lg shadow-violet-500/30" />
            <span className="text-white font-semibold text-lg tracking-tight">SUPPORT247.chat</span>
          </div>

          {/* Hero */}
          <div className="space-y-6">
            <h1 className="text-5xl font-bold text-white leading-[1.1] tracking-tight">
              Multi-agent<br />support,<br />
              <span className="text-violet-300">orchestrated.</span>
            </h1>
            <p className="text-indigo-200 text-lg leading-relaxed max-w-sm">
              Route, resolve, and learn — all from one platform built for modern support teams.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {['RAG Knowledge Base', 'Multi-agent Routing', 'Analytics', 'Custom Agents'].map(f => (
                <span key={f} className="px-3 py-1.5 rounded-full text-xs font-medium text-indigo-100 border border-white/15 bg-white/8 backdrop-blur">{f}</span>
              ))}
            </div>
          </div>

          {/* Testimonial */}
          <div className="bg-white/8 backdrop-blur border border-white/12 rounded-2xl p-5 max-w-sm">
            <p className="text-indigo-100 text-sm leading-relaxed italic">
              "SUPPORT247.chat cut our ticket resolution time in half. The AI routing just works."
            </p>
            <div className="flex items-center gap-2.5 mt-3">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-400 to-indigo-400 flex items-center justify-center text-xs font-bold text-white">S</div>
              <div>
                <p className="text-white text-xs font-semibold">Sarah Chen</p>
                <p className="text-indigo-300 text-xs">Head of Support, Acme Corp</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: form panel ───────────────────────────────────────────────── */}
      <div className={`flex-1 flex flex-col items-center justify-center px-6 py-12 relative transition-colors duration-300 ${t(theme.panel.bg, isDark)}`}>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className={`absolute top-5 right-5 p-2 rounded-lg transition-colors ${t(theme.toggle.bg, isDark)} ${t(theme.toggle.text, isDark)}`}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2.5 mb-10">
          <img src={IMAGES.logo} alt="SUPPORT247.chat" className="w-9 h-9 rounded-xl object-cover shadow-md shadow-violet-500/20" />
          <span className={`font-semibold text-lg ${t(theme.panel.text, isDark)}`}>SUPPORT247.chat</span>
        </div>

        <div className="w-full max-w-[380px]">

          {/* Heading */}
          <div className="mb-8">
            <h2 className={`text-2xl font-bold tracking-tight ${t(theme.panel.text, isDark)}`}>
              {tab === 'login' ? 'Welcome back' : 'Create an account'}
            </h2>
            <p className={`text-sm mt-1 ${t(theme.panel.subtext, isDark)}`}>
              {tab === 'login' ? 'Sign in to your organization portal' : 'Set up your support organization'}
            </p>
          </div>

          {/* Tab switcher */}
          <div className={`flex p-1 rounded-xl mb-7 gap-1 ${t(theme.tabs.track, isDark)}`}>
            {(['login', 'register'] as Tab[]).map(tabKey => (
              <button key={tabKey}
                onClick={() => { setTab(tabKey); setError('') }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                  tab === tabKey ? t(theme.tabs.active, isDark) : t(theme.tabs.inactive, isDark)
                }`}>
                {tabKey === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          {tab === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <InputField label="Email" type="email" value={email} onChange={setEmail}
                placeholder="you@org.com" icon={Mail} required {...inputProps} />
              <InputField label="Password" type="password" value={password} onChange={setPassword}
                placeholder="••••••••" icon={Lock} required {...inputProps} />

              {error && (
                <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border ${t(theme.error.bg, isDark)} ${t(theme.error.border, isDark)}`}>
                  <span className={`text-xs ${t(theme.error.text, isDark)}`}>{error}</span>
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-2.5 mt-1 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm">
                {loading
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in…</>
                  : <>Sign In <ArrowRight className="w-4 h-4" /></>}
              </button>

              <p className={`text-center text-xs pt-1 ${t(theme.footer, isDark)}`}>
                Don't have an account?{' '}
                <button type="button" onClick={() => { setTab('register'); setError('') }}
                  className="text-indigo-500 font-semibold hover:underline">Register</button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <InputField label="Organization Slug" type="text" value={slug} onChange={setSlug}
                placeholder="acme-corp" icon={AtSign} hint="(URL-safe)" required {...inputProps} />
              <InputField label="Display Name" type="text" value={displayName} onChange={setDisplayName}
                placeholder="Acme Corp" icon={Building2} required {...inputProps} />
              <InputField label="Email" type="email" value={regEmail} onChange={setRegEmail}
                placeholder="you@org.com" icon={Mail} required {...inputProps} />
              <InputField label="Password" type="password" value={regPassword} onChange={setRegPassword}
                placeholder="Min 8 characters" icon={Lock} required {...inputProps} />

              {error && (
                <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border ${t(theme.error.bg, isDark)} ${t(theme.error.border, isDark)}`}>
                  <span className={`text-xs ${t(theme.error.text, isDark)}`}>{error}</span>
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-2.5 mt-1 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm">
                {loading
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating account…</>
                  : <>Create Account <ArrowRight className="w-4 h-4" /></>}
              </button>

              <p className={`text-center text-xs pt-1 ${t(theme.footer, isDark)}`}>
                Already have an account?{' '}
                <button type="button" onClick={() => { setTab('login'); setError('') }}
                  className="text-indigo-500 font-semibold hover:underline">Sign In</button>
              </p>
              <p className={`text-center text-xs ${t(theme.footer, isDark)}`}>
                5 built-in agents are seeded automatically.
              </p>
            </form>
          )}
        </div>

        <p className={`text-xs mt-auto pt-10 ${t(theme.footer, isDark)}`}>
          © {new Date().getFullYear()} SUPPORT247.chat
        </p>
      </div>
    </div>
  )
}
