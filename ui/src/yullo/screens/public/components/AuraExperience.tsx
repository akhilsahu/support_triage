import { PublicSpace } from '../../../services/aura/types'
import { AuraViewState } from '../PublicYulloLink'
import { useAuraChat } from '../../../hooks/useAuraChat'
import { AuraIntro } from './AuraIntro'
import { MessageList } from './MessageList'
import { AuraComposer } from './AuraComposer'
import { useEffect, useRef } from 'react'

interface AuraExperienceProps {
  space: PublicSpace
  viewState: AuraViewState
  chat: ReturnType<typeof useAuraChat>
  onMessageSent: (text: string) => void
  onIdentityVisibilityChange: (isVisible: boolean) => void
}

export function AuraExperience({ space, viewState, chat, onMessageSent, onIdentityVisibilityChange }: AuraExperienceProps) {
  const hasMessages = chat.messages.length > 0 || viewState === 'conversation' || viewState === 'transitioning'

  const handleSend = (text: string) => {
    onMessageSent(text)
    chat.sendMessage(text)
  }

  return (
    <div className="flex-1 w-full h-full flex flex-col relative overflow-hidden">
      
      {/* Scrollable Viewport */}
      <div className="flex-1 overflow-y-auto scroll-smooth w-full">
        <AuraIntro 
          space={space} 
          onSelectPrompt={handleSend} 
          onIdentityVisibilityChange={onIdentityVisibilityChange}
        />
        
        {hasMessages && (
          <MessageList 
            spaceId={space.id!}
            messages={chat.messages} 
            isTyping={chat.isTyping} 
          />
        )}
        
        {/* Spacer at the bottom so the last message isn't hidden behind the docked composer */}
        {hasMessages && <div className="h-32 w-full" />}
      </div>

      {/* 
        The unified Composer instance. 
        When no messages, it appears visually positioned below the intro (absolute or statically placed via a wrapper).
        When messages exist, it docks to the bottom.
        We'll use a wrapper that changes classes based on `hasMessages`.
      */}
      <div className={`w-full transition-all duration-500 ease-in-out ${
        hasMessages 
          ? 'absolute bottom-0 left-0 bg-white/80 backdrop-blur-md border-t border-gray-100 p-4'
          : 'absolute left-0 bottom-1/4 pointer-events-none' // positioned relatively near the intro
      }`}>
        <div className={`w-full max-w-4xl mx-auto ${!hasMessages && 'pointer-events-auto px-4 md:px-8'}`}>
          <AuraComposer 
            layoutId="aura-composer" 
            isDocked={hasMessages}
            onSend={handleSend}
            disabled={chat.isTyping}
          />
        </div>
      </div>
    </div>
  )
}
