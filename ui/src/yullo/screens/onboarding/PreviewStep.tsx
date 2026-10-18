import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { yulloOnboardingApi } from '../../api/onboarding'
import { DraftSpace } from './YulloOnboarding'
import { Sparkles, Rocket, ArrowLeft, ArrowRight, Copy, Check, ExternalLink } from 'lucide-react'
import { SpaceRenderer } from '../../components/SpaceRenderer'

export function PreviewStep({ draft, token, onComplete, onBack, onLiveStatusChange }: { draft: DraftSpace, token: string, onComplete: () => void, onBack: () => void, onLiveStatusChange?: (live: boolean) => void }) {
  const [launching, setLaunching] = useState(false)
  const [isLive, setIsLive] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLaunch = async () => {
    setLaunching(true)
    setError(null)
    try {
      // Run the launch API and a minimum 600ms animation delay concurrently
      await Promise.all([
        yulloOnboardingApi.launch(token),
        new Promise(resolve => setTimeout(resolve, 600))
      ])
      setIsLive(true)
      onLiveStatusChange?.(true)
    } catch (e: any) {
      setError(e.message || 'Failed to launch space.')
    } finally {
      setLaunching(false)
    }
  }

  const copyLink = () => {
    navigator.clipboard.writeText(`yullo.co/${draft.handle}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Generate context-aware suggestions based on purpose if available, else fallback
  let understanding = `A space representing ${draft.name}.`
  let suggestedQuestions = [
    "What does this business offer?",
    "How can I work with them?",
    "Show me the most relevant thing for me."
  ]

  if (draft.purpose) {
    understanding = `A ${draft.purpose.toLowerCase()} space representing ${draft.name}.`
  }

  if (isLive) {
    return (
      <div className="max-w-3xl mx-auto w-full h-full flex flex-col items-center justify-center text-center">
        {/* Node animation layer */}
        <div className="relative w-24 h-24 mx-auto mb-10 flex items-center justify-center">
          <motion.div 
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.4, ease: "backOut" }}
            className="w-12 h-12 bg-[#FFFC00] rounded-full flex items-center justify-center absolute z-10"
          >
            <span className="font-bold text-black text-lg">Y</span>
          </motion.div>

          <div className="absolute top-[15%] right-[15%] transform translate-x-1/2 -translate-y-1/2 z-10">
            <motion.div 
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.4, ease: "backOut" }}
              className="w-6 h-6 bg-[#6695FF] rounded-full"
            />
          </div>

          <motion.svg 
            initial={{ opacity: 0, pathLength: 0 }}
            animate={{ opacity: 1, pathLength: 1 }}
            transition={{ delay: 0.3, duration: 0.4, ease: "easeOut" }}
            className="absolute inset-0 w-full h-full overflow-visible z-0"
          >
            <line x1="50%" y1="50%" x2="85%" y2="15%" stroke="#6695FF" strokeWidth="2" strokeOpacity="0.4" />
          </motion.svg>
        </div>

        <motion.h1 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.4 }}
          className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-900 mb-4"
        >
          You're live.
        </motion.h1>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.4 }}
          className="mb-8"
        >
          <div className="text-gray-900 font-medium text-lg mb-4">
            yullo.co/{draft.handle}
          </div>
          <p className="text-gray-500 text-lg max-w-sm mx-auto leading-relaxed">
            Your Space is ready for people to find, explore and start connecting with.
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65, duration: 0.4 }}
          className="flex flex-col items-center gap-4 w-full max-w-[280px]"
        >
          <a 
            href={`/${draft.handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-[#FFFC00] hover:bg-[#E5E300] text-black px-6 py-4 rounded-xl font-bold transition-all shadow-md shadow-[#FFFC00]/10 text-base"
          >
            View my Yullo Link <ArrowRight className="w-4 h-4 ml-1" />
          </a>
          
          <button 
            onClick={onComplete}
            className="w-full flex items-center justify-center bg-transparent border-transparent-2 border-transparent-gray-200 hover:border-transparent-gray-900 hover:bg-gray-50 text-gray-900 px-6 py-3.5 rounded-xl font-bold transition-all text-base bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
          >
            Go to Home
          </button>

          <button 
            onClick={copyLink}
            className="text-gray-500 hover:text-gray-900 font-medium transition-colors text-sm py-2 flex items-center gap-1.5 mt-2 bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto w-full h-full flex flex-col pb-8">
      <div className="mb-8 text-center flex-shrink-0 relative">
        <button 
          onClick={onBack}
          className="absolute left-0 top-1.5 text-gray-400 hover:text-gray-900 transition-colors p-2 -ml-2 rounded-full hover:bg-gray-100 bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 mb-3">
          Your Aura is ready
        </h1>
        <p className="text-gray-500 text-lg">
          Yullo has learned from what you shared.
        </p>
      </div>

      <div className="flex-1 bg-white rounded-3xl shadow-lg border border-gray-200 overflow-hidden flex flex-col mb-8 min-h-[500px]">
        {/* We use the shared SpaceRenderer to display the preview */}
        <div className="flex-1 relative overflow-hidden bg-gray-50 flex">
           {launching && (
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               className="absolute inset-0 z-20 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center"
             >
               <div className="w-16 h-16 bg-[#FFFC00] rounded-full shadow-lg shadow-[#FFFC00]/30 flex items-center justify-center mb-4">
                 <Rocket className="w-8 h-8 text-black animate-pulse" />
               </div>
               <div className="text-gray-900 font-bold text-xl mb-1">Launching Space...</div>
               <div className="text-gray-500 text-sm">Deploying your Aura</div>
             </motion.div>
           )}
           <SpaceRenderer 
             space={{ 
               name: draft.name, 
               handle: draft.handle,
               understanding,
               suggestedQuestions
             }} 
           />
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-600 text-sm border border-red-100 flex-shrink-0">
          {error}
        </div>
      )}

      <div className="flex justify-center flex-shrink-0">
        <button
          onClick={handleLaunch}
          disabled={launching}
          className="bg-[#FFFC00] hover:bg-[#E5E300] text-black px-10 py-4 rounded-full font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-[#FFFC00]/20 text-lg w-full max-w-md justify-center bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
        >
          <Rocket className="w-5 h-5" />
          Launch Space
        </button>
      </div>
    </div>
  )
}
