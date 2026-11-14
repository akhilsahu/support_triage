import { AuraMessage as AuraMessageType } from '../../../services/aura/types'
import { AuraMessage } from './AuraMessage'
import { UserMessage } from './UserMessage'

interface MessageListProps {
  spaceId: string
  messages: AuraMessageType[]
  isTyping: boolean
  onRetry: () => void
}

function isWaitingForContent(message: AuraMessageType) {
  return message.role === 'aura' && message.status === 'streaming'
    && !message.text.trim() && message.ui.length === 0
}

export function MessageList({ spaceId, messages, isTyping, onRetry }: MessageListProps) {
  const latestMessage = messages[messages.length - 1]
  // message.start reserves a reply before its first visible text/card arrives.
  const showLoading = isTyping || Boolean(latestMessage && isWaitingForContent(latestMessage))

  return (
    <div className="w-full px-4 py-6">
      <div className="flex flex-col gap-2 w-full max-w-[900px] mx-auto pb-4">
        {messages.map((msg) => (
          isWaitingForContent(msg) ? null : msg.role === 'user'
            ? <UserMessage key={msg.id} message={msg} />
            : <AuraMessage key={msg.id} spaceId={spaceId} message={msg} onRetry={onRetry} />
        ))}
        
        {showLoading && (
          <div role="status" aria-live="polite" aria-atomic="true" className="flex gap-4 w-full mx-auto py-6">
            <span className="sr-only">Aura is responding</span>
            <div aria-hidden="true" className="w-8 h-8 rounded-full bg-[var(--presentation-accent-soft)] border border-[var(--presentation-border)] flex-shrink-0 flex items-center justify-center text-[var(--presentation-accent-ink)] font-bold text-xs shadow-sm mt-1">
              Y
            </div>
            <div aria-hidden="true" className="flex items-center gap-1.5 h-8">
              <span className="w-1.5 h-1.5 bg-[var(--presentation-accent)] rounded-full motion-safe:animate-bounce [animation-delay:-0.3s]"
                style={{ backgroundColor: 'color-mix(in srgb, var(--presentation-accent), var(--presentation-text) 25%)' }} />
              <span className="w-1.5 h-1.5 bg-teal-500 rounded-full motion-safe:animate-bounce [animation-delay:-0.15s]"
                style={{ backgroundColor: 'oklch(from var(--presentation-accent) 0.65 0.16 calc(h + 120))' }} />
              <span className="w-1.5 h-1.5 bg-rose-500 rounded-full motion-safe:animate-bounce"
                style={{ backgroundColor: 'oklch(from var(--presentation-accent) 0.65 0.16 calc(h + 240))' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
