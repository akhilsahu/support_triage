import { z } from 'zod'

export const sectionTypeSchema = z.enum([
  'identity', 'services', 'portfolio', 'products', 'location', 'featured', 'prompt_starters', 'upcoming_events',
])

export const presentationConfigSchema = z.object({
  schemaVersion: z.literal(1),
  themePreset: z.enum([
    'clean', 'professional', 'technical', 'warm', 'editorial', 'visual',
    'bold', 'minimal', 'personal', 'community', 'trustworthy',
  ]),
  landingEmphasis: z.enum(['balanced', 'visual', 'services', 'local', 'minimal']),
  accent: z.enum(['yullo', 'blue', 'cyan', 'violet', 'coral', 'forest', 'neutral']),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  backgroundTreatment: z.enum(['soft', 'light', 'dark', 'image']),
  hero: z.object({
    visible: z.boolean().optional(),
    assetId: z.string().uuid().nullable().optional(),
    layout: z.enum(['centered', 'image_left', 'image_right', 'image_background']),
  }).strict(),
  sections: z.array(z.object({
    type: sectionTypeSchema,
    variant: z.string().max(80).nullable().optional(),
    visible: z.boolean(),
  }).strict()).refine(
    (sections) => new Set(sections.map((section) => section.type)).size === sections.length,
    'Sections must be unique',
  ).refine(
    (sections) => sections.some((section) => section.type === 'identity'),
    'Identity section is required',
  ),
  contentLayout: z.enum(['left', 'center', 'right', 'stretch']).optional().default('center'),
  visualDensity: z.enum(['minimal', 'balanced', 'expressive']),
  networkIntensity: z.enum(['none', 'very_low', 'low']),
  presentationSource: z.enum(['default', 'aura', 'owner']),
}).strict()

export type SpacePresentationConfig = z.infer<typeof presentationConfigSchema>
export type PresentationSection = SpacePresentationConfig['sections'][number]

export const defaultPresentationConfig = (purpose = 'business'): SpacePresentationConfig => {
  const defaults: Record<string, { theme: SpacePresentationConfig['themePreset']; emphasis: SpacePresentationConfig['landingEmphasis'] }> = {
    business: { theme: 'clean', emphasis: 'services' },
    creator: { theme: 'editorial', emphasis: 'visual' },
    person: { theme: 'minimal', emphasis: 'minimal' },
    organization: { theme: 'community', emphasis: 'balanced' },
  }
  const selected = defaults[purpose] || defaults.business
  return {
    schemaVersion: 1,
    themePreset: selected.theme,
    landingEmphasis: selected.emphasis,
    accent: 'yullo',
    backgroundTreatment: 'soft',
    hero: { layout: 'centered' },
    sections: [
      { type: 'identity', visible: true },
      { type: 'upcoming_events', visible: true },
      { type: 'services', visible: true },
      { type: 'portfolio', visible: true },
      { type: 'products', visible: true },
      { type: 'location', visible: true },
      { type: 'featured', visible: true },
      { type: 'prompt_starters', visible: true },
    ],
    contentLayout: 'center',
    visualDensity: 'balanced',
    networkIntensity: 'very_low',
    presentationSource: 'default',
  }
}
