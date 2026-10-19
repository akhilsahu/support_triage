import { describe, expect, it } from 'vitest'
import { createAppearancePreviewFixtures } from './fixtures'
import { mergeAppearancePreview } from './mergePreviewContent'
import { AppearancePreviewContent } from './types'

describe('createAppearancePreviewFixtures', () => {
  it('creates deterministic fixtures with example tags', () => {
    const fixture = createAppearancePreviewFixtures('business', { name: 'Acme Corp' })
    expect(fixture.sections.length).toBeGreaterThan(0)
    for (const section of fixture.sections) {
      for (const item of section.items) {
        expect(item.source).toBe('example')
        expect(item.sourceEntityId).toBeUndefined()
      }
    }
  })
})

describe('mergeAppearancePreview', () => {
  it('replaces a fixture section only when a validated grounded section matches', () => {
    const fixture = createAppearancePreviewFixtures('business', { name: 'Acme Corp' })
    const grounded: AppearancePreviewContent = {
      schemaVersion: 1,
      sections: [
        {
          type: 'services',
          heading: 'Grounded Services',
          items: [
            {
              key: 'services:abc',
              title: 'Real Service',
              source: 'grounded',
              sourceEntityId: 'abc'
            }
          ]
        },
        {
          type: 'products',
          heading: 'Empty Products',
          items: [] // Empty items, should not replace fixture
        }
      ]
    }

    const merged = mergeAppearancePreview(fixture, grounded)
    
    // Services should be replaced
    const mergedServices = merged.sections.find(s => s.type === 'services')
    expect(mergedServices?.items[0].source).toBe('grounded')
    expect(mergedServices?.items[0].title).toBe('Real Service')

    // Products should remain fixture because grounded items was empty
    const mergedProducts = merged.sections.find(s => s.type === 'products')
    expect(mergedProducts?.items[0].source).toBe('example')
  })

  it('returns fixture if grounded is null', () => {
    const fixture = createAppearancePreviewFixtures('business', { name: 'Acme Corp' })
    const merged = mergeAppearancePreview(fixture, null)
    expect(merged).toBe(fixture)
  })
})
