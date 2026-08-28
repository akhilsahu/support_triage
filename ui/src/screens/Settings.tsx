import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ExternalLink, AlertTriangle, Link2, Key, Type, Monitor, Hash, Save, Bot, MessageSquare } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Toggle } from '../components/ui/Toggle'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { useAppStore } from '../store/useAppStore'
import { API_CONFIG } from '../config/api'
import { apiClient } from '../api/client'
import type { FontSizeKey } from '../config/typography'

function SettingsRow({ title, description, icon: Icon, children, isDestructive, onClick }: any) {
  return (
    <div 
      onClick={onClick}
      className={`flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 last:border-0 ${onClick ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors' : ''}`}
    >
      <div className="flex items-center gap-4">
         {Icon && (
           <div className={`flex items-center justify-center w-8 h-8 rounded-xl border ${isDestructive ? 'bg-red-50 text-red-500 border-red-100 dark:bg-red-900/20 dark:border-red-900/30' : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'}`}>
             <Icon className="w-4 h-4" />
           </div>
         )}
         <div>
           <p className={`text-sm font-bold ${isDestructive ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>{title}</p>
           {description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-sm">{description}</p>}
         </div>
      </div>
      <div className="flex items-center flex-shrink-0 min-w-0 ml-4">
        {children}
      </div>
    </div>
  )
}

function SettingsGroup({ title, children, isDanger }: any) {
  return (
    <div className="space-y-2 mb-8">
      {title && <h3 className={`text-xs font-bold uppercase tracking-wider px-2 ${isDanger ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>{title}</h3>}
      <Card className={`p-0 overflow-hidden ${isDanger ? 'border-red-200 dark:border-red-900/50' : ''}`}>
        {children}
      </Card>
    </div>
  )
}

export function Settings() {
  const navigate = useNavigate()
  const {
    themeMode, setThemeMode,
    fontSize, setFontSize,
    apiKey, setApiKey,
    clientId, setClientId,
    clearChat,
  } = useAppStore()

  const [backendUrl, setBackendUrl] = useState<string>(API_CONFIG.baseURL)
  const [localApiKey, setLocalApiKey] = useState(apiKey)
  const [localClientId, setLocalClientId] = useState(clientId)
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
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 max-w-3xl mx-auto pb-24"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Settings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage your application preferences</p>
        </div>
        <Button onClick={handleSave} className="gap-2 shadow-xs">
          <Save className="w-4 h-4" /> Save Changes
        </Button>
      </div>

      <AnimatePresence>
        {saved && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-6 right-6 z-50 bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-lg flex items-center gap-2"
          >
            Settings saved successfully
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsGroup title="Appearance">
        <SettingsRow 
          title="Theme Mode" 
          description="Choose between Light, Dark, or Beige theme" 
          icon={Monitor}
        >
          <Select
            value={themeMode}
            onChange={e => setThemeMode(e.target.value as 'light' | 'dark' | 'beige')}
            containerClassName="w-40"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="beige">Beige</option>
          </Select>
        </SettingsRow>
        <SettingsRow 
          title="Font Size" 
          description="Adjust the interface text size" 
          icon={Type}
        >
          <Select
            value={fontSize}
            onChange={e => setFontSize(e.target.value as FontSizeKey)}
            containerClassName="w-40"
          >
            <option value="sm">Small (14px)</option>
            <option value="md">Medium (16px)</option>
            <option value="lg">Large (18px)</option>
          </Select>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Connections">
        <SettingsRow 
          title="Backend URL" 
          description={`Currently: ${API_CONFIG.baseURL} · Set VITE_API_URL env var to change permanently.`}
          icon={Link2}
        >
          <Input
            value={backendUrl}
            onChange={e => setBackendUrl(e.target.value)}
            containerClassName="w-64"
            className="font-mono text-xs"
          />
        </SettingsRow>
        <SettingsRow 
          title="API Key" 
          description="Stored locally in browser storage. Never sent to third parties."
          icon={Key}
        >
          <Input
            type={showKey ? 'text' : 'password'}
            value={localApiKey}
            onChange={e => setLocalApiKey(e.target.value)}
            placeholder="Enter API key"
            rightIcon={showKey ? EyeOff : Eye}
            onRightIconClick={() => setShowKey(!showKey)}
            containerClassName="w-64"
          />
        </SettingsRow>
        <SettingsRow 
          title="Client ID" 
          description="Identifies which knowledge base partition to search. Use 'default' for shared knowledge base."
          icon={Hash}
        >
          <Input
            value={localClientId}
            onChange={e => setLocalClientId(e.target.value)}
            placeholder="default"
            containerClassName="w-64"
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Features">
        <SettingsRow 
          title="Active Agents" 
          description="Manage which agents are active in your fleet"
          icon={Bot}
          onClick={() => navigate('/app/agents')}
        >
          <div className="flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
            Configure <ExternalLink className="w-3 h-3" />
          </div>
        </SettingsRow>
        <SettingsRow 
          title="Show Source Citations" 
          description="Display document page references below AI replies."
          icon={MessageSquare}
        >
          <Toggle checked={showCitations} onChange={setShowCitations} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Danger Zone" isDanger>
        <SettingsRow 
          title="Clear Chat History" 
          description="Permanently removes all messages and the current conversation."
          icon={AlertTriangle}
          isDestructive
        >
          <Button variant="danger" onClick={handleClearChat}>
            {chatCleared ? 'Cleared!' : 'Clear Chat'}
          </Button>
        </SettingsRow>
      </SettingsGroup>

    </motion.div>
  )
}
