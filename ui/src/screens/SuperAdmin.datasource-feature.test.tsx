import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DataSourcesPlatformControl, SpaceSettingsModal } from './SuperAdmin'

const jsonResponse = (body: unknown) => Promise.resolve({
  ok: true,
  json: () => Promise.resolve(body),
} as Response)

describe('Super Admin Data Sources controls', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('updates the distinct platform feature endpoint', async () => {
    const onChange = vi.fn()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => jsonResponse({ platform_enabled: false }))
    const user = userEvent.setup()

    render(<DataSourcesPlatformControl adminKey="secret" value onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /disable data sources/i }))

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/data-sources-feature'),
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ platform_enabled: false }) }),
    )
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it.each([
    ['inherit', null],
    ['enabled', true],
    ['disabled', false],
  ] as const)('stores the %s per-space override', async (selection, override) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input)
      if (url.endsWith('/nav')) return jsonResponse({ enabled_nav_items: [] })
      if (url.endsWith('/data-sources-feature') && init?.method === 'PATCH') {
        return jsonResponse({ override, effective_enabled: override !== false })
      }
      if (url.endsWith('/data-sources-feature')) return jsonResponse({ override: selection === 'inherit' ? true : null, effective_enabled: true })
      return jsonResponse({ agents: [], skills: [], kb_docs: [] })
    })
    const user = userEvent.setup()

    render(
      <SpaceSettingsModal
        spaceId="space-1"
        spaceName="Acme"
        spaceSlug="acme"
        adminKey="secret"
        systemNav={{}}
        platformDataSourcesEnabled
        onViewChunks={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const select = await screen.findByRole('combobox', { name: /data sources availability/i })
    await user.selectOptions(select, selection)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/spaces/space-1/data-sources-feature'),
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ override }) }),
    ))
  })

  it('reports the platform master switch independently of the stored override', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url.endsWith('/nav')) return jsonResponse({ enabled_nav_items: [] })
      if (url.endsWith('/data-sources-feature')) return jsonResponse({ override: true, effective_enabled: false })
      return jsonResponse({ agents: [], skills: [], kb_docs: [] })
    })

    render(
      <SpaceSettingsModal
        spaceId="space-1"
        spaceName="Acme"
        spaceSlug="acme"
        adminKey="secret"
        systemNav={{}}
        platformDataSourcesEnabled={false}
        onViewChunks={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(await screen.findByText('Disabled by platform')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /data sources availability/i })).toHaveValue('enabled')
  })
})
