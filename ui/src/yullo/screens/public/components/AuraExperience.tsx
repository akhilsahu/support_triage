import { useLayoutEffect, useRef } from 'react'
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
  const viewportRef = useRef<HTMLDivElement>(null)
  const followOutputRef = useRef(true)
  const lastMessageRef = useRef<string>()

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !chat.messages.length) return
    const latest = chat.messages[chat.messages.length - 1]
    if (latest.role === 'user' && latest.id !== lastMessageRef.current) followOutputRef.current = true
    lastMessageRef.current = latest.id
    // Scroll only the transcript, without restarting a smooth scroll for every token.
    if (followOutputRef.current) viewport.scrollTop = viewport.scrollHeight
  }, [chat.messages, chat.isTyping])

  const handleSend = (text: string) => {
    if (chat.isSending) return
    onMessageSent(text)
    chat.sendMessage(text)
  }

  return (
    <div className="min-h-0 flex-1 w-full flex flex-col relative overflow-hidden">
      
      {/* Scrollable Viewport */}
      <div ref={viewportRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain w-full"
        onScroll={event => {
          const viewport = event.currentTarget
          followOutputRef.current = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 64
        }}>
        <AuraIntro 
          space={space} 
          presentation={presentation}
          heroAssetUrl={heroAssetUrl}
          heroAssetAltText={heroAssetAltText}
          onSelectPrompt={handleSend} 
          onIdentityVisibilityChange={onIdentityVisibilityChange}
          previewContent={previewContent}
        />
        {chat.messagesBefore && <button type="button" disabled={chat.isSending} onClick={() => { followOutputRef.current = false; void chat.loadOlderMessages() }}
          className="mx-auto block min-h-11 px-4 text-sm text-[var(--presentation-text)] underline">Earlier messages</button>}
        
        {hasMessages && (
          <MessageList 
            spaceId={space.id!}
            messages={chat.messages} 
            isTyping={chat.isTyping} 
            onRetry={chat.retryLastMessage}
          />
        )}
      </div>

      {/* Reserve the same composer space before and after sending. */}
      <div className={`w-full shrink-0 border-t py-4 ${
        hasMessages 
          ? 'bg-[color:var(--presentation-surface)]/90 backdrop-blur-md border-[var(--presentation-border)]'
          : 'border-transparent'
      }`} style={{ paddingInline: 'clamp(16px, 4vw, 48px)' }}>
        <div className="w-full mx-auto pointer-events-auto" style={{ maxWidth: 'var(--presentation-content-width)' }}>
          <AuraComposer 
            onSend={handleSend}
            disabled={chat.isSending}
          />
        </div>
      </div>
    </div>
  )
}
