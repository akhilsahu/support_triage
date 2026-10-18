import { AuraProvider, AuraStreamHandlers } from './AuraProvider'
import { PublicSpace } from './types'

const MOCK_SPACE: PublicSpace = {
  id: 'mock-space-id-1234',
  handle: 'northstarstudio',
  displayName: 'Northstar Studio',
  description: 'Brand & product design for startups',
  locationLabel: 'Lucknow · Works globally',
  promptStarters: [
    'What do you offer?',
    'Show me relevant work',
    'How can we work together?'
  ],
  auraEnabled: true,
}

export class MockAuraProvider implements AuraProvider {
  async getPublicSpace(handle: string): Promise<PublicSpace | null> {
    await new Promise(resolve => setTimeout(resolve, 300))
    // Return the mock space for any handle, but inject the requested handle 
    // so the UI displays the correct URL and handle.
    return {
      ...MOCK_SPACE,
      handle: handle
    }
  }

  async startConversation(spaceId: string): Promise<string> {
    await new Promise(resolve => setTimeout(resolve, 200))
    return `conv_${Date.now()}`
  }

  async sendMessage(
    spaceId: string,
    conversationId: string,
    message: string,
    handlers: AuraStreamHandlers
  ): Promise<void> {
    const msgLower = message.toLowerCase()

    // Simulate 3 realistic cases: plain text, text + rich UI, and fallback

    if (msgLower.includes('work') || msgLower.includes('portfolio')) {
      // Case 1: Text + Rich UI
      setTimeout(() => handlers.onEvent({ type: 'message.start', messageId: `msg_${Date.now()}` }), 100)
      setTimeout(() => handlers.onEvent({ type: 'text.delta', delta: 'Here are some of our ' }), 250)
      setTimeout(() => handlers.onEvent({ type: 'text.delta', delta: 'recent projects.' }), 320)
      setTimeout(() => handlers.onEvent({ 
        type: 'ui.add', 
        node: { type: 'portfolio', entityId: '11111111-1111-1111-1111-111111111111' } 
      }), 700)
      setTimeout(() => handlers.onComplete(), 900)
    } else if (msgLower.includes('offer') || msgLower.includes('services')) {
      // Case 2: Another Rich UI
      setTimeout(() => handlers.onEvent({ type: 'message.start', messageId: `msg_${Date.now()}` }), 100)
      setTimeout(() => handlers.onEvent({ type: 'text.delta', delta: 'We specialize in brand and ' }), 250)
      setTimeout(() => handlers.onEvent({ type: 'text.delta', delta: 'product design. Here is what we offer:' }), 400)
      setTimeout(() => handlers.onEvent({ 
        type: 'ui.add', 
        node: { type: 'service', entityId: '22222222-2222-2222-2222-222222222222' } 
      }), 700)
      setTimeout(() => handlers.onComplete(), 900)
    } else if (msgLower.includes('hello') || msgLower.includes('hi')) {
      // Case 3: Plain Text
      setTimeout(() => handlers.onEvent({ type: 'message.start', messageId: `msg_${Date.now()}` }), 100)
      setTimeout(() => handlers.onEvent({ type: 'text.delta', delta: 'Hi there! ' }), 250)
      setTimeout(() => handlers.onEvent({ type: 'text.delta', delta: 'How can I help you learn about Northstar Studio today?' }), 400)
      setTimeout(() => handlers.onComplete(), 600)
    } else {
      // Case 4: Aura doesn't know fallback
      setTimeout(() => handlers.onEvent({ type: 'message.start', messageId: `msg_${Date.now()}` }), 100)
      setTimeout(() => handlers.onEvent({ type: 'text.delta', delta: "I don't know that from what " }), 300)
      setTimeout(() => handlers.onEvent({ type: 'text.delta', delta: "Northstar has shared yet." }), 450)
      setTimeout(() => handlers.onEvent({ 
        type: 'ui.add', 
        node: { 
          type: 'actions', 
          entityIds: ['33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444'] 
        } 
      }), 700)
      setTimeout(() => handlers.onComplete(), 900)
    }
  }
}
