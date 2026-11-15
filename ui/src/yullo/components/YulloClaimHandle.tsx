import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { yulloApiClient } from '../api/client'
import { yulloConfig } from '../config'

export function YulloClaimHandle() {
  const [handle, setHandle] = useState('')
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'unavailable' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const requestId = useRef(0)

  const handleCheck = async (event: React.FormEvent) => {
    event.preventDefault()
    const id = ++requestId.current
    setStatus('checking')
    setMessage('Checking your link…')
    try {
      const { data } = await yulloApiClient.get<{ available: boolean; reason?: string }>('/auth/check-handle', { params: { slug: handle } })
      if (id !== requestId.current) return
      setStatus(data.available ? 'available' : 'unavailable')
      setMessage(data.available ? `yullo.co/${handle} is available. Sign in to continue.` : 'This link isn’t available. Try another name.')
    } catch {
      if (id !== requestId.current) return
      setStatus('error')
      setMessage('We couldn’t check this link. Please try again.')
    }
  }

  return (
    <section id="claim" className="relative z-20 mx-auto my-8 max-w-5xl border-t border-slate-200/60 px-5 py-20 text-center sm:px-6 sm:py-36">
      <h2 className={`text-4xl font-extrabold tracking-tight text-[#101828] sm:text-6xl ${yulloConfig.typography.headingClass}`}>Claim your place.</h2>
      <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-600">A name people can find. A Space that feels like you. An Aura they can talk to.</p>
      <form onSubmit={handleCheck} className="mx-auto mt-10 flex max-w-2xl flex-col items-center gap-3 rounded-3xl border border-slate-200 bg-white p-3 shadow-lg sm:flex-row sm:p-4">
        <label htmlFor="yullo-handle" className="sr-only">Choose your Yullo link</label>
        <div className="flex w-full min-w-0 flex-1 items-center px-2 py-2 font-mono text-base sm:px-4 sm:text-lg">
          <span className="shrink-0 text-slate-400">yullo.co/</span>
          <input id="yullo-handle" type="text" value={handle} required minLength={3} maxLength={50} pattern={'[a-z0-9_\\-]+'} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="handle-help handle-result" onChange={event => {
            requestId.current += 1
            setHandle(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))
            setStatus('idle')
            setMessage('')
          }} placeholder="yourname" className="ml-1 w-full min-w-0 bg-transparent font-bold text-[#101828]" />
        </div>
        <button type="submit" disabled={status === 'checking'} className="yullo-cta inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold disabled:opacity-60 sm:w-auto">
          {status === 'checking' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {status === 'checking' ? 'Checking…' : 'Check availability'}
        </button>
      </form>
      <p id="handle-help" className="mt-4 text-xs text-slate-500">3–50 letters, numbers, hyphens or underscores. Checking doesn’t reserve a link.</p>
      <p id="handle-result" role="status" className="mt-5 text-sm text-slate-700">{message}</p>
      {status === 'available' && <Link to={`/yullo/auth?intent=claim&handle=${encodeURIComponent(handle)}`} className="yullo-cta mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl px-6 py-3 font-semibold"><Check className="h-4 w-4" aria-hidden="true" />Claim your Yullo Link<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
    </section>
  )
}
