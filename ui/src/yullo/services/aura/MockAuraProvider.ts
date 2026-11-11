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
        node: {
          type: 'portfolio',
          entity: {
            id: 'demo-portfolio',
            space_id: spaceId,
            entity_type: 'portfolio_item',
            title: 'Seedling Finance',
            payload_json: {
              title: 'Seedling Finance',
              description: 'A clear product identity and launch experience for an early-stage finance platform.',
              media_urls: [],
              project_url: 'https://example.com',
            },
          },
        }
      }), 700)
      setTimeout(() => handlers.onComplete(), 900)
    } else if (msgLower.includes('offer') || msgLower.includes('services')) {
      // Case 2: Another Rich UI
      setTimeout(() => handlers.onEvent({ type: 'message.start', messageId: `msg_${Date.now()}` }), 100)
      setTimeout(() => handlers.onEvent({ type: 'text.delta', delta: 'We specialize in brand and ' }), 250)
      setTimeout(() => handlers.onEvent({ type: 'text.delta', delta: 'product design. Here is what we offer:' }), 400)
      setTimeout(() => handlers.onEvent({ 
        type: 'ui.add', 
        node: {
          type: 'service',
          entity: {
            id: 'demo-service',
            space_id: spaceId,
            entity_type: 'offering',
            title: 'Brand and product design',
            payload_json: {
              name: 'Brand and product design',
              description: 'Strategy, identity, and digital product design for early-stage teams.',
              duration_minutes: 60,
            },
          },
        }
      }), 700)
      setTimeout(() => handlers.onComplete(), 900)
    } else if (msgLower.includes('location') || msgLower.includes('where')) {
      setTimeout(() => handlers.onEvent({ type: 'message.start', messageId: `msg_${Date.now()}` }), 100)
      setTimeout(() => handlers.onEvent({ type: 'text.delta', delta: 'Here is where you can find us.' }), 250)
      setTimeout(() => handlers.onEvent({
        type: 'ui.add',
        node: {
          type: 'location',
          entity: {
            id: 'demo-location',
            space_id: spaceId,
            entity_type: 'location',
            title: 'Northstar Studio',
            payload_json: {
              name: 'Northstar Studio',
              address: 'Lucknow, India',
              map_url: 'https://maps.google.com',
            },
          },
        },
      }), 500)
      setTimeout(() => handlers.onComplete(), 700)
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
          entities: [
            {
              id: 'demo-action-enquiry',
              space_id: spaceId,
              entity_type: 'action',
              title: 'Start an enquiry',
              payload_json: {
                label: 'Start an enquiry',
                kind: 'enquiry',
                destination_url: 'https://example.com/contact',
              },
            },
            {
              id: 'demo-action-site',
              space_id: spaceId,
              entity_type: 'action',
              title: 'Visit website',
              payload_json: {
                label: 'Visit website',
                kind: 'external_link',
                destination_url: 'https://example.com',
              },
            },
          ]
        } 
      }), 700)
      setTimeout(() => handlers.onComplete(), 900)
    }
  }
}
