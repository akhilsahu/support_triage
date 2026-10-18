import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { useAppStore } from '../../../store/useAppStore'
import { yulloOnboardingApi } from '../../api/onboarding'

import { ChooseStep } from './ChooseStep'
import { ClaimStep } from './ClaimStep'
import { TeachStep } from './TeachStep'
import { PreviewStep } from './PreviewStep'
import { YulloNetworkBackground } from './YulloNetworkBackground'
import yulloLogo from '../../../assets/images/logos/yullo/logo_header_landscape.png'

export type DraftSpace = {
  id: string
  purpose: string | null
  name: string
  handle: string
  image_url: string | null
  current_step: string
  status: string
  sources: any[]
}

export function YulloOnboarding() {
  const { token, onboardingComplete, setOnboardingComplete } = useAppStore()
  const navigate = useNavigate()
  
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<DraftSpace | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activations, setActivations] = useState(0)
  const [viewStep, setViewStep] = useState<string | null>(null)
  const [isLive, setIsLive] = useState(false)

  useEffect(() => {
    if (!token) {
      navigate('/yullo/auth', { replace: true })
      return
    }
    
    if (onboardingComplete) {
      navigate('/yullo/home', { replace: true })
      return
    }

    const init = async () => {
      try {
        const data = await yulloOnboardingApi.getDraft(token)
        setDraft(data)
      } catch (err: any) {
        // 404 means no draft, which is fine, they just start at 'choose'
        if (!err.message.includes('404')) {
          console.error(err)
        }
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [token, onboardingComplete, navigate])

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-[#FFFC00] rounded-full animate-spin" />
      </div>
    )
  }

  // Determine current active step index for the progress bar
  const stepOrder = ['choose', 'claim', 'teach', 'preview']
  const furthestStepString = draft?.current_step || 'choose'
  const furthestStepIndex = stepOrder.indexOf(furthestStepString)
  
  const currentStepString = viewStep || furthestStepString
  const currentStepIndex = stepOrder.indexOf(currentStepString)
  
  const handleUpdateDraft = (updated: DraftSpace) => {
    setDraft(updated)
    setViewStep(updated.current_step) // advance view to the newly unlocked step
  }
  
  const handleComplete = () => {
    setOnboardingComplete(true)
    navigate('/yullo/home', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-gray-900 font-sans selection:bg-[#FFFC00]/50 flex flex-col relative overflow-hidden">
      <YulloNetworkBackground stepIndex={currentStepIndex} activations={activations} />
      
      {/* Header */}
      <header className="flex-shrink-0 px-6 py-6 max-w-5xl mx-auto w-full flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <img src={yulloLogo} alt="Yullo.co" className="h-7 w-auto object-contain" />
        </div>
        
        {/* Navigable Progress Segments */}
        {!isLive && (
          <div className="flex gap-1.5">
            {stepOrder.map((step, idx) => {
              const isUnlocked = idx <= furthestStepIndex
              return (
                <button
                  key={step} 
                  onClick={() => isUnlocked && setViewStep(step)}
                  disabled={!isUnlocked}
                  className={`h-1.5 rounded-full w-8 transition-colors duration-500 ${
                    idx <= currentStepIndex ? 'bg-[#FFFC00]' : 'bg-gray-300'
                  } ${isUnlocked ? 'cursor-pointer hover:bg-[#E5E300]' : 'cursor-not-allowed opacity-50'}`} 
                  title={isUnlocked ? `Go to ${step}` : undefined}
                />
              )
            })}
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center relative z-10 px-6 py-12 max-w-3xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {currentStepString === 'choose' && (
            <motion.div
              key="choose"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.25 }}
              className="w-full"
            >
              <ChooseStep token={token!} onContinue={handleUpdateDraft} draft={draft} />
            </motion.div>
          )}

          {currentStepString === 'claim' && (
            <motion.div
              key="claim"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.25 }}
              className="w-full"
            >
              <ClaimStep 
                draft={draft!} 
                token={token!} 
                onContinue={handleUpdateDraft} 
                onBack={() => setViewStep('choose')}
              />
            </motion.div>
          )}

          {currentStepString === 'teach' && (
            <motion.div
              key="teach"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.25 }}
              className="w-full relative z-10"
            >
              <TeachStep 
                draft={draft!} 
                token={token!} 
                onContinue={handleUpdateDraft} 
                onSourceAdded={() => setActivations(a => a + 1)}
                onSourcesChange={(sources) => setDraft({ ...draft!, sources })}
                onBack={() => setViewStep('claim')}
              />
            </motion.div>
          )}

          {currentStepString === 'preview' && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.25 }}
              className="w-full h-full"
            >
              <PreviewStep 
                draft={draft!} 
                token={token!} 
                onComplete={handleComplete} 
                onBack={() => setViewStep('teach')}
                onLiveStatusChange={setIsLive}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
