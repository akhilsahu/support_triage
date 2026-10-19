import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { appearanceApi } from '../../../api/appearance'
import { defaultPresentationConfig } from '../presentation/schema'
import { useAppearancePreview } from './useAppearancePreview'

vi.mock('../../../api/appearance', () => ({ appearanceApi: { generatePreview: vi.fn() } }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

const ready = {
  status: 'ready' as const,
  content: { schemaVersion: 1 as const, sections: [{ type: 'services' as const, heading: 'Services', items: [{ key: 'cargo', title: 'Cargo transport', source: 'grounded' as const, sourceFactIds: ['bc62ea40-a84e-4dce-81ba-7e13dd0c4f11'] }] }] },
  explanation: '', groundedEntityIds: [], groundedFactIds: [], inputFingerprint: 'test',
}

it('keeps a draft and displays guidance when a rebuild lacks support', async () => {
  const mock = vi.mocked(appearanceApi.generatePreview)
  mock.mockResolvedValueOnce(ready).mockResolvedValueOnce({ ...ready, status: 'insufficient_context', content: null, explanation: 'Confirm service details in Knowledge.' })
  const { result } = renderHook(() => useAppearancePreview('space', defaultPresentationConfig()))
  await act(() => result.current.generatePreview(false, 'services'))
  await act(() => result.current.generatePreview(false, 'services'))
  expect(result.current.state.content).toEqual(ready.content)
  expect(result.current.state.explanation).toBe('Confirm service details in Knowledge.')
})

it('ignores a pending response after switching Spaces', async () => {
  let resolve!: (value: typeof ready) => void
  vi.mocked(appearanceApi.generatePreview).mockImplementation(() => new Promise((done) => { resolve = done }))
  const { result, rerender } = renderHook(({ id }) => useAppearancePreview(id, defaultPresentationConfig()), { initialProps: { id: 'first' } })
  let pending!: Promise<void>
  act(() => { pending = result.current.generatePreview(false, 'services') })
  rerender({ id: 'second' })
  await act(async () => { resolve(ready); await pending })
  expect(result.current.state.content).toBeNull()
  expect(result.current.state.status).toBe('idle')
})

it('accumulates multiple section drafts without unsetting previously built sections', async () => {
  const productsResponse = {
    status: 'ready' as const,
    content: {
      schemaVersion: 1 as const,
      sections: [{
        type: 'products' as const,
        heading: 'Products',
        items: [{ key: 'starlink', title: 'Starlink Dish', source: 'grounded' as const, sourceFactIds: ['bc62ea40-a84e-4dce-81ba-7e13dd0c4f12'] }],
      }],
    },
    explanation: '', groundedEntityIds: [], groundedFactIds: [], inputFingerprint: 'test2',
  }

  const mock = vi.mocked(appearanceApi.generatePreview)
  mock.mockResolvedValueOnce(ready).mockResolvedValueOnce(productsResponse)

  const { result } = renderHook(() => useAppearancePreview('space', defaultPresentationConfig()))

  // Build services section first
  await act(() => result.current.generatePreview(false, 'services'))
  expect(result.current.state.content?.sections).toHaveLength(1)
  expect(result.current.state.content?.sections[0].type).toBe('services')

  // Build products section second
  await act(() => result.current.generatePreview(false, 'products'))
  // Both sections should now exist in content
  expect(result.current.state.content?.sections).toHaveLength(2)
  expect(result.current.state.content?.sections.map((s) => s.type)).toEqual(['services', 'products'])

  // Clear only services section
  act(() => result.current.clearSectionDraft('services'))
  expect(result.current.state.content?.sections).toHaveLength(1)
  expect(result.current.state.content?.sections[0].type).toBe('products')
})

