import { useEffect, useRef } from 'react'
import { AuraMessage as AuraMessageType } from '../../../services/aura/types'
import { AuraMessage } from './AuraMessage'
import { UserMessage } from './UserMessage'

interface MessageListProps {
  spaceId: string
  messages: AuraMessageType[]
  isTyping: boolean
  onRetry: () => void
}

export function MessageList({ spaceId, messages, isTyping, onRetry }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null)
  
  // Auto-scroll logic: scroll into view when messages change
  // For a seamless chat, we scroll to the bottom when new messages arrive or isTyping changes
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  return (
    <div className="w-full px-4 py-6">
      <div className="flex flex-col gap-2 w-full max-w-[900px] mx-auto pb-4">
        {messages.map((msg) => (
          msg.role === 'user' 
            ? <UserMessage key={msg.id} message={msg} />
            : <AuraMessage key={msg.id} spaceId={spaceId} message={msg} onRetry={onRetry} />
        ))}
        
        {isTyping && (
          <div className="flex gap-4 w-full mx-auto py-4 animate-in fade-in duration-300">
            <div className="w-8 h-8 rounded-full bg-[var(--presentation-accent-soft)] border border-[var(--presentation-border)] flex-shrink-0 flex items-center justify-center text-[var(--presentation-accent-ink)] font-bold text-xs shadow-sm mt-1">
              Y
            </div>
            <div className="flex items-center gap-1.5 h-8">
              <span className="w-1.5 h-1.5 bg-[var(--presentation-muted)] rounded-full animate-bounce [animation-delay:-0.3s]"></span>
              <span className="w-1.5 h-1.5 bg-[var(--presentation-muted)] rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-1.5 h-1.5 bg-[var(--presentation-muted)] rounded-full animate-bounce"></span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  )
}
