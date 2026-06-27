// Built-in agent definitions — mirrors the backend's 4 default agents.
// Each brand starts with these inactive; they toggle them on/off.
export interface BuiltinAgent {
  slug: string
  name: string
  description: string
  type: string
  icon: string
  defaultActive: boolean
  capabilities: string[]
  docTypes: string[]
}

export const BUILTIN_AGENTS: BuiltinAgent[] = [
  {
    slug: 'triage',
    name: 'Triage Agent',
    description: 'First point of contact. Classifies intent, analyzes sentiment, and routes to specialist agents.',
    type: 'triage',
    icon: '🎯',
    defaultActive: true,
    capabilities: ['Intent classification', 'Sentiment analysis', 'Priority assignment', 'Empathy protocol'],
    docTypes: [],
  },
  {
    slug: 'logistics',
    name: 'Logistics Agent',
    description: 'Handles shipping, delivery tracking, and order status queries.',
    type: 'logistics',
    icon: '🚚',
    defaultActive: false,
    capabilities: ['Order tracking', 'Delivery status', 'Shipping updates', 'Carrier integration'],
    docTypes: ['policy'],
  },
  {
    slug: 'finance',
    name: 'Finance Agent',
    description: 'Processes refunds, store credits, and compensation requests.',
    type: 'finance',
    icon: '💳',
    defaultActive: false,
    capabilities: ['Refund processing', 'Store credit', 'Compensation', 'Wallet balance'],
    docTypes: ['policy'],
  },
  {
    slug: 'order',
    name: 'Order Agent',
    description: 'Helps customers browse products, place orders, and request replacements.',
    type: 'order',
    icon: '🛒',
    defaultActive: false,
    capabilities: ['Product catalog', 'Order placement', 'Replacement requests', 'Inventory check'],
    docTypes: [],
  },
  {
    slug: 'support',
    name: 'Support Agent',
    description: 'Answers questions from the client knowledge base.',
    type: 'support',
    icon: '🔧',
    defaultActive: false,
    capabilities: ['Troubleshooting', 'Setup guides', 'Error resolution', 'KB search'],
    docTypes: ['tech_support', 'manual', 'faq'],
  },
]
