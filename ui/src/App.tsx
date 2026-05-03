import React, { useState, useEffect, useRef } from 'react'
import { Bot, MessageSquare, Activity, Settings, Send, ShoppingCart, Package, CreditCard, Truck } from 'lucide-react'
import { apiClient } from './api/client'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  agent?: string
  sentiment?: string
  sentimentScore?: number
}

interface AgentStatus {
  name: string
  type: 'triage' | 'logistics' | 'finance' | 'order'
  status: 'idle' | 'active' | 'processing'
  tasksCompleted: number
}

/** Very lightweight markdown → HTML (bold, bullet lists, inline code) */
function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []

  const parseLine = (line: string, key: number): React.ReactNode => {
    // Split on **bold** and `code`
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    return (
      <span key={key}>
        {parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**'))
            return <strong key={i}>{part.slice(2, -2)}</strong>
          if (part.startsWith('`') && part.endsWith('`'))
            return <code key={i} className="bg-gray-100 px-1 rounded text-xs font-mono">{part.slice(1, -1)}</code>
          return part
        })}
      </span>
    )
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('• ') || line.startsWith('- ')) {
      // Collect bullet group
      const bullets: string[] = []
      while (i < lines.length && (lines[i].startsWith('• ') || lines[i].startsWith('- '))) {
        bullets.push(lines[i].slice(2))
        i++
      }
      elements.push(
        <ul key={i} className="list-disc list-inside space-y-1 my-1">
          {bullets.map((b, j) => <li key={j}>{parseLine(b, j)}</li>)}
        </ul>
      )
    } else if (line.trim() === '') {
      elements.push(<br key={i} />)
      i++
    } else {
      elements.push(<p key={i} className="my-0.5">{parseLine(line, i)}</p>)
      i++
    }
  }
  return <>{elements}</>
}

const QUICK_ACTIONS = [
  { label: '📦 My Orders', message: 'Show me my orders', icon: Package },
  { label: '🛒 Browse Products', message: 'Show me your product catalog', icon: ShoppingCart },
  { label: '💳 Refund Status', message: 'What is my refund status?', icon: CreditCard },
  { label: '🚚 Track Package', message: 'Where is my package?', icon: Truck },
]

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hello! I'm OrchestraSupport, your AI customer support assistant.\n\nI can help you with:\n• **Order status** & tracking\n• **Browse products** & place orders\n• **Refunds** & store credit\n• **Replacements** for damaged items\n\nPlease share your phone number or customer ID to get started.",
      timestamp: new Date(),
      agent: 'Triage Agent'
    }
  ])
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [conversationId, setConversationId] = useState<string>()
  const [backendStatus, setBackendStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking')
  const [activeAgent, setActiveAgent] = useState<string>('Triage Agent')
  const bottomRef = useRef<HTMLDivElement>(null)

  const [agents] = useState<AgentStatus[]>([
    { name: 'Triage Agent', type: 'triage', status: 'idle', tasksCompleted: 0 },
    { name: 'Logistics Agent', type: 'logistics', status: 'idle', tasksCompleted: 0 },
    { name: 'Finance Agent', type: 'finance', status: 'idle', tasksCompleted: 0 },
    { name: 'Order Agent', type: 'order', status: 'idle', tasksCompleted: 0 },
  ])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isProcessing])

  useEffect(() => {
    const checkBackend = async () => {
      try {
        await apiClient.healthCheck()
        setBackendStatus('connected')
      } catch {
        setBackendStatus('disconnected')
      }
    }
    checkBackend()
  }, [])

  const sendMessage = async (text: string) => {
    if (!text.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsProcessing(true)

    try {
      const response = await apiClient.sendMessage(text, conversationId)

      if (response.conversation_id && !conversationId) {
        setConversationId(response.conversation_id)
      }

      // Derive active agent from routing label
      const agentLabel = response.agent || 'Triage Agent'
      setActiveAgent(agentLabel)

      const assistantMessage: Message = {
        id: response.message_id || (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.response || 'I understand your concern. Let me help you with that.',
        timestamp: new Date(response.timestamp || Date.now()),
        agent: agentLabel,
        sentimentScore: response.sentiment_score,
        sentiment: response.sentiment_score != null
          ? response.sentiment_score < 0.3 ? '😠 Frustrated'
          : response.sentiment_score < 0.5 ? '😐 Concerned'
          : response.sentiment_score < 0.75 ? '🙂 Neutral'
          : '😊 Positive'
          : undefined
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '⚠️ Backend unavailable. Please ensure the FastAPI backend is running on http://127.0.0.1:8000',
        timestamp: new Date(),
        agent: 'System',
      }])
    } finally {
      setIsProcessing(false)
    }
  }

  const getAgentColor = (type: string) => {
    switch (type) {
      case 'triage': return 'bg-blue-500'
      case 'logistics': return 'bg-green-500'
      case 'finance': return 'bg-purple-500'
      case 'order': return 'bg-orange-500'
      default: return 'bg-gray-500'
    }
  }

  const getAgentBadgeColor = (agentLabel: string) => {
    const lower = agentLabel.toLowerCase()
    if (lower.includes('finance')) return 'bg-purple-100 text-purple-700'
    if (lower.includes('logistics')) return 'bg-green-100 text-green-700'
    if (lower.includes('order')) return 'bg-orange-100 text-orange-700'
    return 'bg-blue-100 text-blue-700'
  }

  const getSentimentBar = (score?: number) => {
    if (score == null) return null
    const pct = Math.round(score * 100)
    const color = score < 0.3 ? 'bg-red-400' : score < 0.6 ? 'bg-yellow-400' : 'bg-green-400'
    return (
      <div className="flex items-center gap-1 mt-1">
        <span className="text-xs text-gray-400">Sentiment</span>
        <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-gray-400">{pct}%</span>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-5 border-b border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <Bot className="w-8 h-8 text-blue-600 flex-shrink-0" />
            <div>
              <h1 className="text-lg font-bold text-gray-900">OrchestraSupport</h1>
              <p className="text-xs text-gray-500">AI Multi-Agent System</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              backendStatus === 'connected' ? 'bg-green-500' :
              backendStatus === 'disconnected' ? 'bg-red-500' :
              'bg-yellow-500 animate-pulse'
            }`} />
            <span className="text-xs text-gray-600">
              {backendStatus === 'connected' ? '✓ Backend connected' :
               backendStatus === 'disconnected' ? '✗ Backend offline' :
               '⋯ Connecting...'}
            </span>
          </div>
        </div>

        {/* Agent Status */}
        <div className="flex-1 overflow-y-auto p-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" />
            Agents
          </h2>
          <div className="space-y-2">
            {agents.map((agent) => {
              const isActive = activeAgent.toLowerCase().includes(agent.type)
              return (
                <div key={agent.name}
                  className={`rounded-lg p-3 border transition-colors ${isActive ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-transparent'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-400 animate-pulse' : 'bg-gray-300'}`} />
                      <span className="text-sm font-medium text-gray-800">{agent.name}</span>
                    </div>
                    <span className={`px-2 py-0.5 text-xs rounded-full text-white ${getAgentColor(agent.type)}`}>
                      {agent.type}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Capabilities */}
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-5 mb-3">
            Capabilities
          </h2>
          <div className="space-y-1.5 text-xs text-gray-600">
            {[
              '📦 Order status & history',
              '🚚 Shipment tracking',
              '💳 Refunds & store credit',
              '🛒 Browse & buy products',
              '🔄 Request replacements',
              '👤 Account info & wallet',
            ].map(c => <div key={c}>{c}</div>)}
          </div>
        </div>

        <div className="p-4 border-t border-gray-200">
          <button className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-blue-600" />
          <div>
            <h2 className="text-base font-semibold text-gray-900">Customer Support Chat</h2>
            <p className="text-xs text-gray-500">Powered by Level-2 Agentic AI · {activeAgent}</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.map((message) => (
            <div key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-2xl rounded-xl px-4 py-3 shadow-sm ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-900'
              }`}>
                {message.agent && message.role === 'assistant' && (
                  <div className="flex items-center gap-2 mb-2">
                    <Bot className="w-3.5 h-3.5 text-gray-400" />
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getAgentBadgeColor(message.agent)}`}>
                      {message.agent}
                    </span>
                    {message.sentiment && (
                      <span className="text-xs text-gray-400">{message.sentiment}</span>
                    )}
                  </div>
                )}
                <div className={`text-sm leading-relaxed ${message.role === 'user' ? '' : 'text-gray-800'}`}>
                  {message.role === 'assistant'
                    ? renderMarkdown(message.content)
                    : message.content}
                </div>
                {message.role === 'assistant' && getSentimentBar(message.sentimentScore)}
                <div className={`text-xs mt-1.5 ${message.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}

          {isProcessing && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
                <div className="flex items-center gap-1.5">
                  {[0, 0.15, 0.3].map((delay, i) => (
                    <div key={i} className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                      style={{ animationDelay: `${delay}s` }} />
                  ))}
                  <span className="text-sm text-gray-500 ml-2">Agent is thinking...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Quick Actions */}
        <div className="bg-white border-t border-gray-100 px-6 pt-3 pb-1 flex gap-2 flex-wrap">
          {QUICK_ACTIONS.map(({ label, message }) => (
            <button key={label}
              onClick={() => sendMessage(message)}
              disabled={isProcessing}
              className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors disabled:opacity-50">
              {label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="bg-white px-6 pb-5 pt-3">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
              placeholder="Type a message or use a quick action above..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              disabled={isProcessing}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={isProcessing || !input.trim()}
              className="px-5 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App

// Made with Bob
