import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { apiClient } from '../api/client'

interface ChatbotOption {
  id: string
  slug: string
  display_name: string
  logo_url: string | null
  is_default: boolean
}

export function TestChat() {
  const spaceSlug = useAppStore(s => s.spaceSlug)
  const currentChatbotId = useAppStore(s => s.currentChatbotId)
  const navigate = useNavigate()

  // Resolve the sidebar-selected chatbot -> its slug so the embedded customer
  // chat opens on that bot (not always the space default).
  const [bots, setBots] = useState<ChatbotOption[]>([])
  const [currentSlug, setCurrentSlug] = useState<string | null>(null)

  // Fetch the space's chatbots and resolve the current selection to a slug.
  useEffect(() => {
    if (!spaceSlug) return
    apiClient.getChatbots()
      .then((data: ChatbotOption[]) => {
        setBots(data)
        const selected = data.find(b => b.id === currentChatbotId)
        if (selected) setCurrentSlug(selected.slug)
        else {
          const def = data.find(b => b.is_default) ?? data[0]
          setCurrentSlug(def?.slug ?? null)
        }
      })
      .catch(() => setCurrentSlug(null))
  }, [spaceSlug]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-resolve when the sidebar selection changes and the list is already loaded.
  useEffect(() => {
    const selected = bots.find(b => b.id === currentChatbotId)
    if (selected) setCurrentSlug(selected.slug)
    else {
      const def = bots.find(b => b.is_default) ?? bots[0]
      setCurrentSlug(def?.slug ?? null)
    }
  }, [currentChatbotId, bots])

  if (!spaceSlug) return (
    <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
      No chatbot slug found.
    </div>
  )

  // Open the space default bot at /{slug}; a specifically selected sidebar bot
  // at /{slug}/{chatbotSlug} (CustomerChat resolves that path segment).
  const defaultSlug = bots.find(b => b.is_default)?.slug ?? null
  const frameSrc = currentSlug && currentSlug !== defaultSlug
    ? `/${spaceSlug}/${currentSlug}`
    : `/${spaceSlug}`

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
          key={frameSrc}
          src={frameSrc}
          className="w-full h-full border-0"
          title="Test Chat"
        />
      </div>
    </div>
  )
}