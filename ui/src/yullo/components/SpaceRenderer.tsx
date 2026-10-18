import { Send } from 'lucide-react'

export interface SpaceContextData {
  name: string
  handle: string
  understanding?: string
  suggestedQuestions?: string[]
}

export function SpaceRenderer({ space }: { space: SpaceContextData }) {
  const summary = space.understanding || `A space representing ${space.name}.`
  const questions = space.suggestedQuestions && space.suggestedQuestions.length > 0 
    ? space.suggestedQuestions 
    : [
      "What does this business offer?",
      "How can I work with them?",
      "Show me the most relevant thing for me."
    ]

  return (
    <div className="flex flex-col h-full bg-white text-gray-900 font-sans w-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white/80 backdrop-blur-sm z-10 sticky top-0 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#FFFC00] to-[#FFFC00]/50 flex items-center justify-center text-black font-bold text-lg shadow-sm">
            {space.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-gray-900 leading-tight">{space.name}</div>
            <div className="text-xs text-gray-500 font-medium tracking-wide">yullo.co/{space.handle}</div>
          </div>
        </div>
      </div>

      {/* Chat / Body Area */}
      <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-6 bg-gray-50/50">
        
        {/* Intro Message */}
        <div className="flex gap-4 max-w-[90%]">
          <div className="w-8 h-8 rounded-full bg-[#FFFC00] flex-shrink-0 flex items-center justify-center text-black font-bold text-xs shadow-sm mt-1">
            Y
          </div>
          <div className="space-y-3">
            <div className="bg-white border border-gray-100 text-gray-800 p-4 rounded-2xl rounded-tl-none shadow-sm">
              <p className="text-sm leading-relaxed mb-3">
                Hello! I'm the AI assistant for <strong>{space.name}</strong>.
              </p>
              <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-xl border border-gray-100">
                <span className="font-semibold text-gray-700 block mb-1">Yullo understands this space as:</span>
                {summary}
              </div>
            </div>
            
            {/* Suggested Questions */}
            <div className="flex flex-col gap-2 pt-1 items-start">
              {questions.map((q, i) => (
                <button 
                  key={i}
                  className="text-left text-sm bg-white border-transparent border-transparent-gray-200 text-gray-700 hover:border-transparent-gray-300 hover:bg-gray-50 px-4 py-2.5 rounded-2xl transition-colors shadow-sm bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Input Box */}
      <div className="p-4 bg-white border-t border-gray-100 flex-shrink-0">
        <div className="relative max-w-2xl mx-auto">
          <input 
            type="text" 
            placeholder={`Ask about ${space.name}...`}
            className="w-full bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 rounded-full py-3.5 pl-5 pr-12 focus:outline-none focus:ring-2 focus:ring-[#FFFC00]/50 focus:border-[#FFFC00]"
          />
          <button className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-[#FFFC00] text-black hover:bg-[#E5E300] transition-colors bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90">
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
