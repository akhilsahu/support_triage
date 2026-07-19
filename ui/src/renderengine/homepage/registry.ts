import type { ComponentType } from 'react'
import { HeroSection } from './HeroSection'
import { KeyBenefitsSection } from './KeyBenefitsSection'
import { CapabilitiesSection } from './CapabilitiesSection'
import { SuggestedQuestionsSection } from './SuggestedQuestionsSection'
import { FaqSection } from './FaqSection'
import { QuickTopicsSection } from './QuickTopicsSection'
import { TrustBadgesSection } from './TrustBadgesSection'
import { PromoSection } from './PromoSection'
import { DataBlockSection } from './DataBlockSection'
import type { SectionProps } from './types'

// Mirrors app/renderengine/homepage_sections.py's ALLOWED_SECTIONS -- keep
// these two lists in sync. Adding a new section type means: one new
// component file in this directory + one new entry here + one new entry in
// the backend's ALLOWED_SECTIONS. CustomerChat.tsx never needs to change.
export const SECTION_REGISTRY: Record<string, ComponentType<SectionProps>> = {
  hero: HeroSection,
  key_benefits: KeyBenefitsSection,
  capabilities: CapabilitiesSection,
  suggested_questions: SuggestedQuestionsSection,
  faq: FaqSection,
  quick_topics: QuickTopicsSection,
  trust_badges: TrustBadgesSection,
  promo: PromoSection,
  data_block: DataBlockSection,
}
