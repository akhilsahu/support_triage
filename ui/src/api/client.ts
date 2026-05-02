/**
 * API Client for OrchestraSupport Backend
 * Connects React UI to FastAPI backend
 */

import axios, { AxiosInstance } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

class APIClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`)
        return config
      },
      (error) => {
        return Promise.reject(error)
      }
    )

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        console.log(`[API] Response:`, response.data)
        return response
      },
      (error) => {
        console.error(`[API] Error:`, error.response?.data || error.message)
        return Promise.reject(error)
      }
    )
  }

  // Health check
  async healthCheck() {
    const response = await this.client.get('/health')
    return response.data
  }

  // Chat with agents
  async sendMessage(message: string, conversationId?: string) {
    const response = await this.client.post('/api/v1/chat', {
      message,
      conversation_id: conversationId,
    })
    return response.data
  }

  // Get agent status
  async getAgentStatus() {
    const response = await this.client.get('/api/v1/agents/status')
    return response.data
  }

  // Analyze sentiment
  async analyzeSentiment(message: string) {
    const response = await this.client.post('/api/v1/empathy/analyze', {
      message,
    })
    return response.data
  }

  // Get conversation history
  async getConversationHistory(conversationId: string) {
    const response = await this.client.get(`/api/v1/conversations/${conversationId}`)
    return response.data
  }

  // List all conversations
  async listConversations() {
    const response = await this.client.get('/api/v1/conversations')
    return response.data
  }
}

export const apiClient = new APIClient()
export default apiClient

// Made with Bob
