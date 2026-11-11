import { PublicSpace } from '../../../services/aura/types'
import { AuraViewState } from '../PublicYulloLink'
import { useAuraChat } from '../../../hooks/useAuraChat'
import { AuraIntro } from './AuraIntro'
import { MessageList } from './MessageList'
import { AuraComposer } from './AuraComposer'
import type { SpacePresentationConfig } from '../../appearance/presentation/schema'

import { AppearancePreviewContent } from '../../appearance/preview/types'

interface AuraExperienceProps {
  space: PublicSpace
  presentation: SpacePresentationConfig
  heroAssetUrl?: string
  heroAssetAltText?: string
  viewState: AuraViewState
  chat: ReturnType<typeof useAuraChat>
  onMessageSent: (text: string) => void
  onIdentityVisibilityChange: (isVisible: boolean) => void
  previewContent?: AppearancePreviewContent
}

export function AuraExperience({ space, presentation, heroAssetUrl, heroAssetAltText, viewState, chat, onMessageSent, onIdentityVisibilityChange, previewContent }: AuraExperienceProps) {
  const hasMessages = chat.messages.length > 0 || viewState === 'conversation' || viewState === 'transitioning'

  const handleSend = (text: string) => {
    onMessageSent(text)
    chat.sendMessage(text)
  }

  return (
    <div className="min-h-0 flex-1 w-full flex flex-col relative overflow-hidden">
      
      {/* Scrollable Viewport */}
      <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth w-full">
        <AuraIntro 
          space={space} 
          presentation={presentation}
          heroAssetUrl={heroAssetUrl}
          heroAssetAltText={heroAssetAltText}
          onSelectPrompt={handleSend} 
          onIdentityVisibilityChange={onIdentityVisibilityChange}
          previewContent={previewContent}
        />
        
        {hasMessages && (
          <MessageList 
            spaceId={space.id!}
            messages={chat.messages} 
            isTyping={chat.isTyping} 
            onRetry={chat.retryLastMessage}
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
          ? 'absolute bottom-0 left-0 bg-[color:var(--presentation-surface)]/90 backdrop-blur-md border-t border-[var(--presentation-border)] py-4'
          : 'relative shrink-0 pt-4 pb-8'
      }`} style={{ paddingInline: 'clamp(16px, 4vw, 48px)' }}>
        <div className="w-full mx-auto pointer-events-auto" style={{ maxWidth: 'var(--presentation-content-width)' }}>
          <AuraComposer 
            layoutId="aura-composer" 
            isDocked={hasMessages}
            onSend={handleSend}
            disabled={chat.isSending}
          />
        </div>
      </div>
    </div>
  )
}
