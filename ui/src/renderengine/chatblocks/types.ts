// Shared contract for structured chat-reply blocks (table / card / tabs).
//
// Content shapes deliberately mirror renderengine/homepage's DataBlock
// (table {columns, rows}, card {heading, value?, body}, tabs {tabs:[{label,body}]})
// so a future backend generator can reuse the same schema/tool for both
// homepage data blocks and chat replies instead of inventing a second one.
// No "chart" variant here -- not asked for, and a support reply answering
// "what's the fee" has no time-series to plot.

export interface ChatBlockTable {
  columns: string[]
  rows: string[][]
}

export interface ChatBlockCard {
  heading: string
  value?: string | null
  body: string
}

export interface ChatBlockTabs {
  tabs: { label: string; body: string }[]
}

export interface ChatBlock {
  block_type: 'table' | 'card' | 'tabs'
  title?: string
  content: ChatBlockTable | ChatBlockCard | ChatBlockTabs
}

// Subset of CustomerChat's ThemeTokens this module actually reads. CustomerChat
// passes its full theme object through (structurally compatible), same pattern
// as renderengine/homepage/types.ts's SectionTheme.
export interface ChatBlockTheme {
  textPrimary: string
  textSecondary: string
  textMuted: string
  chipCls: string
  chipHoverCls: string
}
