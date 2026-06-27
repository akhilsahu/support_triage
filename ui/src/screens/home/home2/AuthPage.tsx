import { Link } from 'react-router-dom'
import { Mail, Lock, Building2, AtSign, ArrowRight, Home } from 'lucide-react'
import { IMAGES } from '../../../config/images.config'
import { useAuthForm, Tab } from '../useAuthForm'
import { AuthInputField, AuthInputTheme } from '../AuthInputField'

const inputTheme: AuthInputTheme = {
  labelClass: 'text-xs font-bold tracking-wider text-slate-400',
  labelPx: 'px-4',
  hintClass: 'text-xs text-slate-500 font-medium',
  tooltipHoverClass: 'hover:text-violet-400',
  iconFocusClass: 'group-focus-within:text-violet-450',
  inputClass: 'bg-slate-900/60 border border-white/10 rounded-full text-slate-200 placeholder-slate-500 focus:border-violet-500/50 focus:ring-4 focus:ring-violet-500/10 shadow-[0_4px_15px_rgba(0,0,0,0.3)] font-medium',
  tooltipBoxClass: 'bg-slate-900 border border-white/10 text-slate-250 rounded-2xl shadow-2xl',
  tooltipArrowBorder: 'border-t-slate-900',
}

export function AuthPage2() {
  const {
    tab, setTab, loading, error, setError,
    email, setEmail, password, setPassword,
    slug, setSlug, displayName, setDisplayName,
    regEmail, setRegEmail, regPassword, setRegPassword,
    handleLogin, handleRegister,
  } = useAuthForm()

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 py-12 md:py-16 bg-[#090a15] relative overflow-y-auto text-slate-200"
      style={{ fontFamily: "'Satoshi', 'Google Sans', Inter, system-ui, sans-serif" }}
    >
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[10%] right-[-10%] w-[600px] h-[600px] rounded-full bg-violet-600/10 blur-[130px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-650/10 blur-[120px]" />
      </div>

      <div className="absolute top-6 left-6 z-20">
        <Link to="/" className="p-2.5 rounded-full bg-slate-900/60 border border-white/10 shadow-sm text-slate-400 hover:text-white transition-all duration-200 backdrop-blur-md focus:outline-none" title="Back to home">
          <Home className="w-4 h-4" />
        </Link>
      </div>

      <div className="w-full max-w-[390px] bg-slate-900/40 border border-white/10 rounded-[36px] p-6 md:p-8 shadow-[0_30px_70px_rgba(139,92,246,0.06)] backdrop-blur-2xl transition-all duration-300 relative z-10 my-auto">

        <div className="flex flex-col items-center mb-5">
          <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-650 p-0.5 shadow-lg shadow-violet-500/20 flex items-center justify-center mb-2">
            <div className="w-full h-full bg-[#090a15] rounded-full p-2.5 flex items-center justify-center">
              <img src={IMAGES.logo} alt="Logo" className="w-full h-full rounded-full object-cover" />
            </div>
          </div>
          <p className="text-xs text-slate-450 mt-2 font-semibold text-center leading-relaxed">
            {tab === 'login' ? 'Sign in to access your dashboard' : 'Set up your support space'}
          </p>
        </div>

        <div className="flex bg-[#090a15]/85 p-1 rounded-full gap-1 mb-6 max-w-[190px] mx-auto border border-white/5">
          {(['login', 'register'] as Tab[]).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => { setTab(tabKey); setError('') }}
              className={`flex-1 py-1.5 px-3 rounded-full text-xs font-bold tracking-wide transition-all duration-300 ${tab === tabKey ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-350'}`}
            >
              {tabKey === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 px-4 py-2.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold leading-relaxed animate-fadeIn">
            {error}
          </div>
        )}

        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4 animate-fadeIn">
            <AuthInputField label="Email" type="email" value={email} onChange={setEmail} placeholder="name@company.com" icon={Mail} required theme={inputTheme} />
            <AuthInputField label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" icon={Lock} required theme={inputTheme} />
            <div className="flex justify-end px-1">
              <Link to="/app/forgot-password" className="text-xs text-slate-500 hover:text-violet-400 font-semibold transition-colors">Forgot password?</Link>
            </div>
            <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-violet-600 to-indigo-650 hover:from-violet-500 hover:to-indigo-500 text-white font-bold py-3 px-6 rounded-full shadow-lg shadow-violet-550/20 hover:shadow-xl active:scale-[0.97] transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none mt-3 text-sm">
              {loading ? (<><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /><span>Connecting…</span></>) : (<><span>Sign In</span><ArrowRight className="w-4 h-4" /></>)}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3.5 animate-fadeIn">
            <AuthInputField label="Space Slug" type="text" value={slug} onChange={setSlug} placeholder="acme-corp" icon={AtSign} hint="(URL-safe)" required tooltip="Unique identifier for your space URL (e.g., support247.chat/acme-corp)." theme={inputTheme} />
            <AuthInputField label="Space Name" type="text" value={displayName} onChange={setDisplayName} placeholder="Acme Corp" icon={Building2} required tooltip="Public title of your support space displayed to your customers." theme={inputTheme} />
            <AuthInputField label="Email" type="email" value={regEmail} onChange={setRegEmail} placeholder="name@company.com" icon={Mail} required tooltip="Your administrator email used to sign in and manage this support space." theme={inputTheme} />
            <AuthInputField label="Password" type="password" value={regPassword} onChange={setRegPassword} placeholder="Min. 8 characters" icon={Lock} required tooltip="Secure password to protect your admin dashboard (minimum 8 characters)." theme={inputTheme} />
            <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-violet-600 to-indigo-650 hover:from-violet-500 hover:to-indigo-500 text-white font-bold py-3 px-6 rounded-full shadow-lg shadow-violet-550/20 hover:shadow-xl active:scale-[0.97] transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none mt-5 text-sm">
              {loading ? (<><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /><span>Creating space…</span></>) : (<><span>Create Space</span><ArrowRight className="w-4 h-4" /></>)}
            </button>
          </form>
        )}

        <div className="mt-6 pt-5 border-t border-white/5 text-center">
          <p className="text-xs text-slate-500 font-semibold leading-relaxed">
            {tab === 'login' ? (
              <>New to the platform?{' '}<button type="button" onClick={() => { setTab('register'); setError('') }} className="text-violet-400 font-bold hover:underline transition-colors focus:outline-none">Create space</button></>
            ) : (
              <>Already have an account?{' '}<button type="button" onClick={() => { setTab('login'); setError('') }} className="text-violet-400 font-bold hover:underline transition-colors focus:outline-none">Sign in</button></>
            )}
          </p>
        </div>
      </div>

      <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-slate-700 font-semibold tracking-wider">
        © {new Date().getFullYear()} SUPPORT247.chat
      </p>
    </div>
  )
}
