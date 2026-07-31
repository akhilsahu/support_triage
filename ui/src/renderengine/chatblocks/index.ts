export { ChatBlockRenderer } from './ChatBlockRenderer'
export type { ChatBlock, ChatBlockTheme, ChatBlockTable, ChatBlockCard, ChatBlockTabs } from './types'

// Kill switch for this feature. The backend does not send `blocks` on any
// reply yet -- flipping this to false is the fast revert if the rendered
// result doesn't look good; every call site checks it instead of deleting
// code. Flip true only alongside a backend that actually populates
// CustomerChatResponse.blocks (see docs/structured-response-rendering-plan.md).
export const CHAT_BLOCKS_ENABLED = true
