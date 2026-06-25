import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export function TestChat() {
  const spaceSlug  = useAppStore(s => s.spaceSlug)
  const navigate = useNavigate()

  if (!spaceSlug) return (
    <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
      No chatbot slug found.
    </div>
  )

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
        <button
          onClick={() => navigate('/app/agents')}
          className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Agents
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <iframe
          key={spaceSlug}
          src={`/${spaceSlug}`}
          className="w-full h-full border-0"
          title="Test Chat"
        />
      </div>
    </div>
  )
}
