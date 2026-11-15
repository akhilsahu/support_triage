import { defaultPresentationConfig, presentationConfigSchema, type SpacePresentationConfig } from './schema'

export function resolvePresentationConfig(
  value: unknown,
  purpose = 'business',
): SpacePresentationConfig {
  const parsed = presentationConfigSchema.safeParse(value)
  if (!parsed.success && import.meta.env?.DEV) {
    console.warn('[resolvePresentationConfig] validation failed, falling back to default:', parsed.error.format())
  }
  const config = parsed.success ? parsed.data : defaultPresentationConfig(purpose)

  if (!config.sections.some(section => section.type === 'upcoming_events')) {
    const index = config.sections.findIndex(section => section.type === 'identity') + 1
    config.sections.splice(index, 0, { type: 'upcoming_events', visible: true })
  }

  // Ensure all section types are present so they can be toggled and rendered
  const allTypes: Array<SpacePresentationConfig['sections'][number]['type']> = [
    'identity', 'services', 'portfolio', 'products', 'location', 'featured', 'prompt_starters'
  ]
  const existingTypes = new Set(config.sections.map(s => s.type))
  for (const type of allTypes) {
    if (!existingTypes.has(type)) {
      config.sections.push({ type, visible: true })
    }
  }

  return config
}

export function isSectionVisible(config: SpacePresentationConfig, type: string): boolean {
  return config.sections.find((section) => section.type === type)?.visible ?? false
}
