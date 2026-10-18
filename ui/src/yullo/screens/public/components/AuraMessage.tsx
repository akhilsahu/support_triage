import { AuraMessage as AuraMessageType } from '../../../services/aura/types'
import { AuraRenderer } from '../../../components/generative-ui/AuraRenderer'

export function AuraMessage({ spaceId, message }: { spaceId: string, message: AuraMessageType }) {
  return (
    <div className="flex gap-4 w-full mx-auto py-6">
      <div className="w-8 h-8 rounded-full bg-[#FFF8C7] border border-[rgba(238,211,45,0.35)] flex-shrink-0 flex items-center justify-center text-[#151B27] font-bold text-xs shadow-sm mt-1">
        Y
      </div>
      <div className="flex-1 space-y-4">
        {message.text && (
          <div className="text-gray-800 text-[15px] leading-relaxed whitespace-pre-wrap max-w-[760px]">
            {message.text}
            {message.status === 'streaming' && (
              <span className="inline-block w-2 h-4 ml-1 bg-gray-300 animate-pulse" />
            )}
          </div>
        )}
        
        {message.ui.map((node: any, i: number) => (
          <div key={i} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <AuraRenderer spaceId={spaceId} node={node} />
          </div>
        ))}

        {message.status === 'error' && (
          <div className="text-sm text-red-500 mt-2">
            An error occurred while generating the response.
          </div>
        )}
      </div>
    </div>
  )
}
