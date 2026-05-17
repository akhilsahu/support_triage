import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ExternalLink, AlertTriangle } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Toggle } from '../components/ui/Toggle'
import { useAppStore } from '../store/useAppStore'
import { API_CONFIG } from '../config/api'
import { apiClient } from '../api/client'

export function Settings() {
  const navigate = useNavigate()
  const {
    isDark, toggleTheme,
    apiKey, setApiKey,
    clientId, setClientId,
    clearChat,
  } = useAppStore()

  const [backendUrl, setBackendUrl] = useState(API_CONFIG.baseURL)
  const [localApiKey, setLocalApiKey] = useState(apiKey)
  const [localClientId, setLocalClientId] = useState(clientId)
  const [fontSize, setFontSize] = useState('medium')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [chatCleared, setChatCleared] = useState(false)
  const [showCitations, setShowCitations] = useState(false)

  useEffect(() => {
    apiClient.getProfile().then(data => {
      setShowCitations(data.show_rag_citations ?? false)
    }).catch(() => {})
  }, [])

  const handleSave = async () => {
    setApiKey(localApiKey)
    setClientId(localClientId)
    try {
      await apiClient.updateProfile({ show_rag_citations: showCitations })
    } catch { /* non-fatal */ }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleClearChat = () => {
    clearChat()
    setChatCleared(true)
    setTimeout(() => setChatCleared(false), 2000)
  }

  return (
    <div className="p-6 max-w-2xl space-y-5">
      {/* Save confirmation */}
      {saved && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg animate-fadeIn">
          Settings saved successfully
        </div>
      )}

      {/* Appearance */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Appearance</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Dark Mode</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Switch between light and dark theme</p>
            </div>
            <Toggle checked={isDark} onChange={toggleTheme} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Font Size</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Adjust the interface text size</p>
            </div>
            <select
              value={fontSize}
              onChange={e => setFontSize(e.target.value)}
              className="px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white"
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </div>
        </div>
      </Card>

      {/* API Configuration */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">API Configuration</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Backend URL</label>
            <input
              type="text"
              value={backendUrl}
              onChange={e => setBackendUrl(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white font-mono"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Currently: <span className="font-mono text-indigo-600 dark:text-indigo-400">{API_CONFIG.baseURL}</span>
              {' · '}Set <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">VITE_API_URL</code> env var to change permanently.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">API Key</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={localApiKey}
                onChange={e => setLocalApiKey(e.target.value)}
                placeholder="Enter API key (optional)"
                className="w-full px-3 py-2 pr-10 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white"
              />
              <button
                onClick={() => setShowKey(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Stored locally in browser storage. Never sent to third parties.</p>
          </div>
        </div>
      </Card>

      {/* Client Configuration */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Client Configuration</h3>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Client ID</label>
          <input
            type="text"
            value={localClientId}
            onChange={e => setLocalClientId(e.target.value)}
            placeholder="default"
            className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
            The Client ID identifies which knowledge base partition to search when agents handle requests.
            Each client ID has its own document collection in the RAG vector store.
            Use <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">default</code> for the shared knowledge base.
          </p>
        </div>
      </Card>

      {/* Agents */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Agents</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Manage which agents are active in your fleet</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate('/agents')}>
            Configure <ExternalLink className="w-3 h-3" />
          </Button>
        </div>
      </Card>

      {/* Chat Responses */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Chat Responses</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Show Source Citations</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Display document page references below AI replies. Customers can expand to see the source.
            </p>
          </div>
          <Toggle checked={showCitations} onChange={setShowCitations} />
        </div>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave}>
          Save Settings
        </Button>
      </div>

      {/* Danger Zone */}
      <Card className="p-5 border-red-200 dark:border-red-900">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">Danger Zone</h3>
        </div>
        <div className="flex items-center justify-between py-3 border border-red-100 dark:border-red-900/50 rounded-lg px-4">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Clear Chat History</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Permanently removes all messages and the current conversation.</p>
          </div>
          <Button variant="danger" size="sm" onClick={handleClearChat}>
            Clear Chat
          </Button>
        </div>
        {chatCleared && (
          <p className="text-xs text-red-500 dark:text-red-400 mt-2">Chat history cleared.</p>
        )}
      </Card>
    </div>
  )
}
