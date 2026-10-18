export interface PublicSpace {
  id?: string
  handle: string
  displayName: string
  description: string
  avatarUrl?: string
  locationLabel?: string
  promptStarters?: string[]
  auraEnabled: boolean
  // public action metadata
  websiteUrl?: string
  contactEmail?: string
}

export type AuraUINode =
  | { type: 'service'; entityId: string }
  | { type: 'portfolio'; entityId: string }
  | { type: 'location'; entityId: string }
  | { type: 'actions'; entityIds: string[] }

export interface Citation {
  id: string
  label: string
  snippet?: string
  sourceUrl?: string
}

export interface AuraResponse {
  uiVersion: 1
  text: string
  ui: AuraUINode[]
  citations?: Citation[]
  followups?: string[]
}

export type AuraEvent =
  | { type: 'message.start'; messageId: string }
  | { type: 'text.delta'; delta: string }
  | { type: 'citation.add'; citation: Citation }
  | { type: 'ui.add'; node: AuraUINode }
  | { type: 'followups'; items: string[] }
  | { type: 'message.done' }
  | { type: 'error'; message: string }

export interface AuraMessage {
  id: string
  role: 'user' | 'aura'
  text: string
  ui: AuraUINode[]
  citations?: Citation[]
  status: 'streaming' | 'complete' | 'error'
}
