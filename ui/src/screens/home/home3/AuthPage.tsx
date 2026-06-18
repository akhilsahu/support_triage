import { Link } from 'react-router-dom'
import { Mail, Lock, Building2, AtSign, ArrowRight, Home } from 'lucide-react'
import { IMAGES } from '../../../config/images.config'
import { useAuthForm, Tab } from '../useAuthForm'
import { AuthInputField, AuthInputTheme } from '../AuthInputField'

const inputTheme: AuthInputTheme = {
  labelClass: 'text-xs font-extrabold uppercase tracking-wider text-slate-700',
  labelPx: 'px-1',
  hintClass: 'text-[11px] text-slate-500 font-bold uppercase tracking-wider',
  tooltipHoverClass: 'hover:text-amber-700',
  iconFocusClass: 'group-focus-within:text-amber-600',
  inputClass: 'bg-white border border-amber-200/60 rounded-xl text-slate-800 placeholder-slate-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/5 font-semibold',
  tooltipBoxClass: 'bg-white border border-slate-200 text-slate-600 rounded-xl shadow-lg',
  tooltipArrowBorder: 'border-t-white',
}

export function AuthPage3() {
  const {
    tab, setTab, loading, error, setError,
    email, setEmail, password, setPassword,
    slug, setSlug, displayName, setDisplayName,
    regEmail, setRegEmail, regPassword, setRegPassword,
    handleLogin, handleRegister,
  } = useAuthForm()

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-[#FAF7F0] text-slate-800"
      style={{ fontFamily: "'Satoshi', 'Google Sans', Inter, system-ui, sans-serif" }}
    >
      <div className="absolute top-6 left-6 z-20">
        <Link to="/" className="p-2.5 rounded-xl border border-amber-250/40 text-slate-500 hover:text-slate-900 transition-all duration-200" title="Back to home">
          <Home className="w-4 h-4" />
        </Link>
      </div>

      <div className="w-full max-w-[360px] mx-auto transition-all duration-300 relative z-10">

        <div className="flex flex-col items-center mb-5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-r from-amber-600 via-rose-500 to-pink-500 p-0.5 shadow-sm flex items-center justify-center mb-3">
            <div className="w-full h-full bg-white rounded-xl p-2.5 flex items-center justify-center">
              <img src={IMAGES.logo} alt="Logo" className="w-full h-full rounded-xl object-cover" />
            </div>
          </div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight text-center">
            {tab === 'login' ? 'Sign In to Your Space' : 'Create Your Custom Space'}
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-semibold text-center leading-relaxed">
            {tab === 'login' ? 'Access your support dashboard' : 'Get your custom URL link in under 5 seconds'}
          </p>
        </div>

        <div className="flex bg-slate-200/50 p-1 rounded-xl gap-1 mb-5 max-w-[190px] mx-auto border border-amber-200/10">
          {(['login', 'register'] as Tab[]).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => { setTab(tabKey); setError('') }}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold tracking-wide transition-all duration-300 ${tab === tabKey ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {tabKey === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold leading-relaxed animate-fadeIn">
            {error}
          </div>
        )}

        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4 animate-fadeIn">
            <AuthInputField label="Your Email" type="email" value={email} onChange={setEmail} placeholder="name@company.com" icon={Mail} required theme={inputTheme} />
            <AuthInputField label="Your Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" icon={Lock} required theme={inputTheme} />
            <div className="flex justify-end px-1">
              <Link to="/app/forgot-password" className="text-xs text-amber-600 hover:text-rose-500 font-semibold transition-colors">Forgot password?</Link>
            </div>
            <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-amber-600 via-rose-500 to-pink-500 text-white font-extrabold text-xs uppercase tracking-widest py-3.5 px-6 rounded-xl shadow-md hover:opacity-95 active:scale-[0.97] transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none mt-3">
              {loading ? (<><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /><span>Connecting…</span></>) : (<><span>Sign In</span><ArrowRight className="w-4 h-4" /></>)}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3.5 animate-fadeIn">
            <AuthInputField label="Space URL Name" type="text" value={slug} onChange={setSlug} placeholder="acme-corp" icon={AtSign} hint="(URL name)" required tooltip="Unique text name for your custom direct link (e.g. support247.chat/acme-corp)." theme={inputTheme} />
            <AuthInputField label="Space Display Name" type="text" value={displayName} onChange={setDisplayName} placeholder="Acme Corp" icon={Building2} required tooltip="The display title customers see at the top of your custom page." theme={inputTheme} />
            <AuthInputField label="Your Email" type="email" value={regEmail} onChange={setRegEmail} placeholder="name@company.com" icon={Mail} required tooltip="Used to log in and manage your details." theme={inputTheme} />
            <AuthInputField label="Your Password" type="password" value={regPassword} onChange={setRegPassword} placeholder="Min. 8 characters" icon={Lock} required tooltip="Please choose a safe password with 8 characters minimum." theme={inputTheme} />
            <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-amber-600 via-rose-500 to-pink-500 text-white font-extrabold text-xs uppercase tracking-widest py-3.5 px-6 rounded-xl shadow-md hover:opacity-95 active:scale-[0.97] transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none mt-5">
              {loading ? (<><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /><span>Creating Space…</span></>) : (<><span>Create Space</span><ArrowRight className="w-4 h-4" /></>)}
            </button>
          </form>
        )}

        <div className="mt-5 pt-4 border-t border-amber-200/20 text-center">
          <p className="text-xs text-slate-500 font-semibold leading-relaxed">
            {tab === 'login' ? (
              <>New to the platform?{' '}<button type="button" onClick={() => { setTab('register'); setError('') }} className="text-rose-500 font-extrabold hover:underline transition-colors focus:outline-none">Create space</button></>
            ) : (
              <>Already have an account?{' '}<button type="button" onClick={() => { setTab('login'); setError('') }} className="text-rose-500 font-extrabold hover:underline transition-colors focus:outline-none">Sign in</button></>
            )}
          </p>
        </div>

        <p className="mt-6 text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">
          © {new Date().getFullYear()} SUPPORT247.chat
        </p>
      </div>
    </div>
  )
}
