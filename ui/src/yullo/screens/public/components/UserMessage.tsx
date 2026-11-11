import { AuraMessage as AuraMessageType } from '../../../services/aura/types'

export function UserMessage({ message }: { message: AuraMessageType }) {
  return (
    <div className="flex justify-end w-full py-4">
      <div className="bg-[var(--presentation-accent-soft)] text-[var(--presentation-text)] px-5 py-3 rounded-2xl rounded-tr-sm max-w-[85%] shadow-sm">
        <p className="text-[15px] leading-relaxed">{message.text}</p>
      </div>
    </div>
  )
}
