import React, { useState, useEffect } from 'react'
import { Bot, MessageSquare, Activity, Settings, Send, AlertCircle } from 'lucide-react'
import { apiClient } from './api/client'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  agent?: string
  sentiment?: string
}

interface AgentStatus {
  name: string
  type: 'triage' | 'logistics' | 'finance'
  status: 'idle' | 'active' | 'processing'
  tasksCompleted: number
}

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I\'m OrchestraSupport, your AI customer support assistant. How can I help you today?',
      timestamp: new Date(),
      agent: 'Triage Agent'
    }
  ])
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [conversationId, setConversationId] = useState<string>()
  const [backendStatus, setBackendStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking')

  const [agents] = useState<AgentStatus[]>([
    { name: 'Triage Agent', type: 'triage', status: 'idle', tasksCompleted: 0 },
    { name: 'Logistics Agent', type: 'logistics', status: 'idle', tasksCompleted: 0 },
    { name: 'Finance Agent', type: 'finance', status: 'idle', tasksCompleted: 0 }
  ])

  // Check backend health on mount
  useEffect(() => {
    const checkBackend = async () => {
      try {
        await apiClient.healthCheck()
        setBackendStatus('connected')
        console.log('✅ Backend connected')
      } catch (error) {
        setBackendStatus('disconnected')
        console.error('❌ Backend disconnected:', error)
      }
    }
    checkBackend()
  }, [])

  const handleSend = async () => {
    if (!input.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    const messageText = input
    setInput('')
    setIsProcessing(true)

    try {
      // Call backend API
      const response = await apiClient.sendMessage(messageText, conversationId)
      
      // Update conversation ID if new
      if (response.conversation_id && !conversationId) {
        setConversationId(response.conversation_id)
      }

      const assistantMessage: Message = {
        id: response.message_id || (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.response || 'I understand your concern. Let me help you with that.',
        timestamp: new Date(response.timestamp || Date.now()),
        agent: response.agent || 'Triage Agent',
        sentiment: response.sentiment_score ?
          (response.sentiment_score < 0.3 ? 'angry' :
           response.sentiment_score < 0.6 ? 'neutral' : 'happy') : undefined
      }
      
      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Failed to send message:', error)
      
      // Fallback to mock response if backend is down
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '⚠️ Backend is currently unavailable. This is a mock response. Please ensure the FastAPI backend is running on http://127.0.0.1:8000',
        timestamp: new Date(),
        agent: 'System',
        sentiment: 'neutral'
      }
      setMessages(prev => [...prev, assistantMessage])
    } finally {
      setIsProcessing(false)
    }
  }

  const getAgentColor = (type: string) => {
    switch (type) {
      case 'triage': return 'bg-blue-500'
      case 'logistics': return 'bg-green-500'
      case 'finance': return 'bg-purple-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-400'
      case 'processing': return 'bg-yellow-400 animate-pulse'
      default: return 'bg-gray-400'
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <Bot className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">OrchestraSupport</h1>
              <p className="text-sm text-gray-500">AI Multi-Agent System</p>
            </div>
          </div>
          {/* Backend Status Indicator */}
          <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-gray-50 rounded-lg">
            <div className={`w-2 h-2 rounded-full ${
              backendStatus === 'connected' ? 'bg-green-500' :
              backendStatus === 'disconnected' ? 'bg-red-500' :
              'bg-yellow-500 animate-pulse'
            }`} />
            <span className="text-xs text-gray-600">
              Backend: {backendStatus === 'connected' ? '✓ Connected' :
                       backendStatus === 'disconnected' ? '✗ Disconnected' :
                       '⋯ Checking...'}
            </span>
          </div>
        </div>

        {/* Agent Status */}
        <div className="flex-1 overflow-y-auto p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Agent Status
          </h2>
          <div className="space-y-3">
            {agents.map((agent) => (
              <div key={agent.name} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(agent.status)}`} />
                    <span className="text-sm font-medium text-gray-900">{agent.name}</span>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full text-white ${getAgentColor(agent.type)}`}>
                    {agent.type}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  Tasks: {agent.tasksCompleted}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Settings */}
        <div className="p-4 border-t border-gray-200">
          <button className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Customer Support Chat</h2>
              <p className="text-sm text-gray-500">Powered by Level-2 Agentic AI</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-2xl rounded-lg px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-900'
                }`}
              >
                {message.agent && (
                  <div className="text-xs text-gray-500 mb-1 flex items-center gap-2">
                    <Bot className="w-3 h-3" />
                    {message.agent}
                    {message.sentiment && (
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-600">
                        {message.sentiment}
                      </span>
                    )}
                  </div>
                )}
                <p className="text-sm">{message.content}</p>
                <div className={`text-xs mt-1 ${message.role === 'user' ? 'text-blue-100' : 'text-gray-400'}`}>
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          {isProcessing && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 text-gray-500">
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                  <span className="text-sm ml-2">Agent is thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Type your message..."
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isProcessing}
              />
              <button
                onClick={handleSend}
                disabled={isProcessing || !input.trim()}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App

// Made with Bob
