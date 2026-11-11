export interface PublicSpace {
  id?: string
  handle: string
  displayName: string
  description: string
  avatarUrl?: string
  locationLabel?: string
  promptStarters?: string[]
  auraEnabled: boolean
  bookingLinks?: { id: string; label: string; url: string }[]
  // public action metadata
  websiteUrl?: string
  contactEmail?: string
  presentationConfig?: import('../../screens/appearance/presentation/schema').SpacePresentationConfig
  heroAsset?: { id: string; url: string; altText?: string | null } | null
  landingContent?: import('../../screens/appearance/preview/types').AppearancePreviewContent
}

export interface AuraEntitySnapshot {
  id: string
  space_id: string
  entity_type: string
  title: string
  payload_json: Record<string, unknown>
}

export type AuraUINode =
  | { type: 'images'; imageIds: string[] }
  | { type: 'service'; entityId?: string; entity?: AuraEntitySnapshot }
  | { type: 'portfolio'; entityId?: string; entity?: AuraEntitySnapshot }
  | { type: 'location'; entityId?: string; entity?: AuraEntitySnapshot }
  | { type: 'actions'; entityIds?: string[]; entities?: AuraEntitySnapshot[] }

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
