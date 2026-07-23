// Shared contract for pluggable homepage-section components.
//
// Deliberately decoupled from CustomerChat.tsx's internal ThemeTokens type --
// sections only need the subset of theme classes they actually use, so
// CustomerChat can pass its full theme object (structurally compatible)
// without this library depending on CustomerChat's private types.

export interface SectionTheme {
  textPrimary: string
  textSecondary: string
  textMuted: string
  chipCls: string
  chipHoverCls: string
}

export interface SectionSpace {
  name?: string
  description?: string
  logo_url?: string
}

export interface SectionOverrides {
  promo?: { text: string }
}

export interface FaqItem {
  question: string
  answer: string
}

export interface QuickTopic {
  label: string
  prompt: string
}

// AI-designed, search-grounded data block (see app/renderengine/data_block.py).
// block_type decides which content shape is populated -- always exactly one
// of the four. Always illustrative, never a verified fact -- disclaimer is
// always present (backend forces a default if the model omits one).
export interface DataBlockTable {
  columns: string[]
  rows: string[][]
}
export interface DataBlockChartPoint {
  label: string
  value: number
}
export interface DataBlockChart {
  chart_type: 'bar' | 'line'
  data: DataBlockChartPoint[]
}
export interface DataBlockCard {
  heading: string
  value?: string | null
  body: string
}
export interface DataBlockTabs {
  tabs: { label: string; body: string }[]
}
export interface DataBlock {
  block_type: 'table' | 'chart' | 'card' | 'tabs'
  title: string
  illustrative: true
  disclaimer: string
  content: DataBlockTable | DataBlockChart | DataBlockCard | DataBlockTabs
}

// Trust-metrics band (see app/renderengine/stat_band.py). Illustrative --
// representative figures for display, always with a disclaimer.
export interface StatBandItem {
  value: string
  label: string
}
export interface StatBand {
  stats: StatBandItem[]
  illustrative: true
  disclaimer: string
}

// "How it works" numbered journey (see app/renderengine/process_steps.py).
export interface ProcessStep {
  label: string
  body?: string
}
export interface ProcessSteps {
  title: string
  steps: ProcessStep[]
}

// Competitor comparison grid (see app/renderengine/comparison.py). Admin-curated
// grids are verified (illustrative:false, no disclaimer); AI/web ones are
// illustrative with a disclaimer.
export interface Comparison {
  columns: string[]
  rows: string[][]
  source: string
  illustrative: boolean
  disclaimer: string
}

export interface SectionProps {
  theme: SectionTheme
  space: SectionSpace | null
  suggestions: string[]
  onSend: (text: string) => void
  overrides?: SectionOverrides
  keyBenefits?: string[]
  capabilities?: string[]
  faq?: FaqItem[]
  quickTopics?: QuickTopic[]
  trustBadges?: string[]
  dataBlock?: DataBlock
  statBand?: StatBand
  processSteps?: ProcessSteps
  comparison?: Comparison
}
