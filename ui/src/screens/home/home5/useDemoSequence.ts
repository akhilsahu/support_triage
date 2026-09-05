import { useCallback, useEffect, useState } from 'react'
import { trackLanding } from './analytics'
import { scenarios } from './content'

type Status = 'idle' | 'playing' | 'paused' | 'complete'
export function useDemoSequence(reducedMotion: boolean, visible: boolean) {
  const [scenarioIndex, setScenarioIndex] = useState(0)
  const [step, setStep] = useState(3)
  const [status, setStatus] = useState<Status>('idle')
  const scenario = scenarios[scenarioIndex]

  const start = useCallback(
    (index: number) => {
      setScenarioIndex(index)
      setStep(reducedMotion ? 3 : 0)
      setStatus(reducedMotion ? 'complete' : 'playing')
      trackLanding('demo_started', { scenario: scenarios[index].id })
      if (reducedMotion)
        trackLanding('demo_completed', { scenario: scenarios[index].id })
    },
    [reducedMotion]
  )

  useEffect(() => {
    if (status !== 'playing') return
    if (reducedMotion) {
      setStep(3)
      setStatus('complete')
      trackLanding('demo_completed', { scenario: scenario.id })
      return
    }
    if (!visible || document.hidden) {
      setStatus('paused')
      return
    }
    const timer = window.setTimeout(() => {
      if (step >= 2) {
        setStep(3)
        setStatus('complete')
        trackLanding('demo_completed', { scenario: scenario.id })
      } else setStep(step + 1)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [status, step, scenario.id, visible, reducedMotion])

  useEffect(() => {
    const pauseIfHidden = () => {
      if (document.hidden) setStatus((s) => (s === 'playing' ? 'paused' : s))
    }
    document.addEventListener('visibilitychange', pauseIfHidden)
    return () => document.removeEventListener('visibilitychange', pauseIfHidden)
  }, [])

  return {
    scenario,
    scenarioIndex,
    status,
    step,
    start,
    pause: () => setStatus('paused'),
    resume: () => setStatus('playing'),
  }
}
