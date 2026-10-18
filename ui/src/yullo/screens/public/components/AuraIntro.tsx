import { useInView } from 'react-intersection-observer'
import { PublicSpace } from '../../../services/aura/types'
import { IdentityBlock } from './IdentityBlock'
import { PromptStarters } from './PromptStarters'
import { useEffect } from 'react'

interface AuraIntroProps {
  space: PublicSpace
  onSelectPrompt: (text: string) => void
  onIdentityVisibilityChange: (isVisible: boolean) => void
}

export function AuraIntro({ space, onSelectPrompt, onIdentityVisibilityChange }: AuraIntroProps) {
  const { ref: identityRef, inView: identityVisible } = useInView({
    threshold: 0.05,
    rootMargin: "-56px 0px 0px 0px", // Account for the sticky header height
  })

  useEffect(() => {
    onIdentityVisibilityChange(identityVisible)
  }, [identityVisible, onIdentityVisibilityChange])

  return (
    <div className="w-full flex flex-col items-center justify-center pt-[15vh] pb-8">
      <div ref={identityRef} className="w-full flex flex-col items-center justify-center">
        <IdentityBlock space={space} />
      </div>
      <PromptStarters 
        prompts={space.promptStarters} 
        onSelect={onSelectPrompt}
      />
    </div>
  )
}
