import { useState, useEffect, useRef } from 'react'
import { yulloOnboardingApi } from '../../api/onboarding'
import { DraftSpace } from './YulloOnboarding'
import { Upload, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react'

export function ClaimStep({ draft, token, onContinue, onBack }: { draft: DraftSpace, token: string, onContinue: (d: DraftSpace) => void, onBack: () => void }) {
  const [name, setName] = useState(draft.name === 'My Space' ? '' : draft.name)
  const [handle, setHandle] = useState(draft.handle.startsWith('draft-') ? '' : draft.handle)
  
  const [handleStatus, setHandleStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle')
  const [handleReason, setHandleReason] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const timerRef = useRef<any>(null)

  useEffect(() => {
    if (!handle) {
      setHandleStatus('idle')
      setHandleReason(null)
      return
    }

    setHandleStatus('checking')
    clearTimeout(timerRef.current)
    
    timerRef.current = setTimeout(async () => {
      try {
        const res = await yulloOnboardingApi.validateHandle(handle)
        if (res.valid) {
          setHandleStatus('valid')
          setHandleReason(null)
        } else {
          setHandleStatus('invalid')
          setHandleReason(res.reason || 'Invalid handle')
        }
      } catch (err: any) {
        setHandleStatus('invalid')
        setHandleReason(err.message || 'Error checking handle')
      }
    }, 500)
    
    return () => clearTimeout(timerRef.current)
  }, [handle, token])

  const handleContinue = async () => {
    if (!name || !handle || handleStatus !== 'valid') return
    setLoading(true)
    setError(null)
    
    try {
      // 1. Update draft
      const updatedDraft = await yulloOnboardingApi.updateDraft({ name, handle })
      
      // 2. Reserve handle (which also moves step to 'teach')
      await yulloOnboardingApi.reserveHandle(handle)
      
      // The API returns ok, we need to artificially update the local draft state 
      // or re-fetch. Since we know it succeeds:
      onContinue({ ...updatedDraft, handle, current_step: 'teach' })
    } catch (err: any) {
      setError(err.message || 'Failed to claim space.')
      // Might need to re-validate handle if someone took it
      if (err.message.toLowerCase().includes('taken')) {
        setHandleStatus('invalid')
        setHandleReason('This handle was just taken.')
      }
    } finally {
      setLoading(false)
    }
  }

  const getLabelForPurpose = (purpose: string | null) => {
    switch (purpose) {
      case 'business': return 'Business or brand name'
      case 'organization': return 'Organization name'
      default: return 'Name'
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-8 text-center relative">
        <button 
          onClick={onBack}
          className="absolute left-0 top-1.5 text-gray-400 hover:text-gray-900 transition-colors p-2 -ml-2 bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 mb-3">
          Give your space a name.
        </h1>
        <p className="text-gray-500 text-lg">
          Choose how this space will appear on Yullo and claim its unique link.
        </p>
      </div>

      <div className="space-y-6 mb-10">
        
        {/* Logo (Optional visual placeholder) */}
        <div className="flex flex-col items-center mb-2">
           <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-300 cursor-pointer hover:bg-gray-100 hover:text-gray-400 transition-colors">
              <Upload className="w-5 h-5" />
           </div>
           <span className="text-xs font-medium text-gray-400 mt-2">Optional logo</span>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            {getLabelForPurpose(draft.purpose)}
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Acme Corp, Jane Doe"
            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FFFC00]/50 focus:border-[#FFFC00] transition-all text-lg shadow-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Your Yullo Link</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-lg pointer-events-none">
              yullo.co/
            </span>
            <input
              type="text"
              value={handle}
              onChange={e => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              placeholder="acme"
              className={`w-full pl-[85px] pr-12 py-3 bg-white border rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 transition-all text-lg shadow-sm ${
                handleStatus === 'invalid' 
                  ? 'border-red-300 focus:ring-red-400/50 focus:border-red-400' 
                  : handleStatus === 'valid'
                    ? 'border-emerald-300 focus:ring-emerald-400/50 focus:border-emerald-400'
                    : 'border-gray-200 focus:ring-[#FFFC00]/50 focus:border-[#FFFC00]'
              }`}
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
              {handleStatus === 'checking' && (
                 <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
              )}
              {handleStatus === 'valid' && (
                 <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              )}
              {handleStatus === 'invalid' && (
                 <AlertCircle className="w-5 h-5 text-red-500" />
              )}
            </div>
          </div>
          
          <div className="min-h-[24px] mt-2">
            {handleStatus === 'valid' && handle.length > 0 && (
              <p className="text-sm font-medium text-emerald-600 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> yullo.co/{handle} is available
              </p>
            )}
            {handleStatus === 'invalid' && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-red-500">
                  {handleReason}
                </p>
                {handleReason?.includes('taken') && (
                  <p className="text-sm text-gray-500">
                    Try instead: <span className="text-gray-900 font-medium cursor-pointer hover:underline" onClick={() => setHandle(`${handle}1`)}>{handle}1</span>, <span className="text-gray-900 font-medium cursor-pointer hover:underline" onClick={() => setHandle(`${handle}hq`)}>{handle}hq</span>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-600 text-sm border border-red-100">
          {error}
        </div>
      )}

      <div className="flex justify-center">
        <button
          onClick={handleContinue}
          disabled={!name || !handle || handleStatus !== 'valid' || loading}
          className="bg-gray-900 hover:bg-[var(--accent-solid)] text-[var(--accent-on-solid)] px-8 py-3.5 rounded-full font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : null}
          Claim this link &rarr;
        </button>
      </div>
    </div>
  )
}
