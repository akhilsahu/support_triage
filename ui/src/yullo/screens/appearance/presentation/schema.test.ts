import { describe, expect, it } from 'vitest'
import { defaultPresentationConfig, presentationConfigSchema } from './schema'
import { resolvePresentationConfig } from './presentationResolver'

describe('Yullo appearance presentation contract', () => {
  it('creates purpose-specific defaults', () => {
    expect(defaultPresentationConfig('creator').themePreset).toBe('editorial')
    expect(defaultPresentationConfig('person').landingEmphasis).toBe('minimal')
  })

  it('rejects unknown fields and duplicate sections', () => {
    const base = defaultPresentationConfig('business')
    expect(presentationConfigSchema.safeParse({ ...base, unknown: true }).success).toBe(false)
    expect(presentationConfigSchema.safeParse({ ...base, sections: [...base.sections, base.sections[0]] }).success).toBe(false)
  })

  it('falls back deterministically when saved input is invalid', () => {
    expect(resolvePresentationConfig({ accent: 'rainbow' }, 'organization')).toEqual(
      defaultPresentationConfig('organization'),
    )
  })

  it('accepts sections with null variant and preserves contentLayout', () => {
    const base = defaultPresentationConfig('business')
    const withNullVariants = {
      ...base,
      contentLayout: 'right' as const,
      sections: base.sections.map((s) => ({ ...s, variant: null })),
    }
    const parsed = presentationConfigSchema.safeParse(withNullVariants)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.contentLayout).toBe('right')
    }

    const resolved = resolvePresentationConfig(withNullVariants, 'business')
    expect(resolved.contentLayout).toBe('right')
  })
})
