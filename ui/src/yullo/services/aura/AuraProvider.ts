import { PublicSpace, AuraEvent } from './types'

export interface AuraStreamHandlers {
  onEvent: (event: AuraEvent) => void
  onError: (error: Error) => void
  onComplete: () => void
}

export interface AuraProvider {
  getPublicSpace(handle: string): Promise<PublicSpace | null>
  startConversation(spaceId: string, accountId?: string | null): Promise<string>
  sendMessage(
    spaceId: string,
    conversationId: string,
    message: string,
    handlers: AuraStreamHandlers,
    signal?: AbortSignal,
    accountId?: string | null,
  ): Promise<void>
}
