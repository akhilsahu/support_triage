import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiClient, type UrlPreview } from '../api/client'
import { KBModal } from './KnowledgeBase'

const preview = (mode: 'quick' | 'deep', extract: string, rating: 'good' | 'questionable' | 'poor' = 'good'): UrlPreview => ({
  preview_token: `${mode}-token`, mode, provider: mode === 'deep' ? 'firecrawl' : 'httpx',
  quality: { rating, score: rating === 'good' ? 90 : 20, reasons: rating === 'good' ? [] : ['boilerplate_heavy'] },
  title: `${mode} title`, final_url: 'https://example.com/page', content_type: 'text/html',
  size_bytes: 2048, page_count: 1, char_count: extract.length, extract, truncated: false, vision_skipped: false,
})

function renderModal() {
  render(<KBModal kbId="kb-1" defaultTab="url" onClose={vi.fn()} onDone={vi.fn()} />)
}

async function quickPreview(result = preview('quick', 'Quick extracted content', 'poor')) {
  vi.spyOn(apiClient, 'previewUrl').mockResolvedValueOnce(result)
  const user = userEvent.setup()
  renderModal()
  await user.type(screen.getByLabelText(/website url/i), 'https://example.com/page')
  await user.click(screen.getByRole('button', { name: /^preview$/i }))
  expect(await screen.findByText(result.extract)).toBeVisible()
  return user
}

describe('URL preview selection', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('keeps quick preview when deep preview fails', async () => {
    const user = await quickPreview()
    vi.mocked(apiClient.previewUrl).mockRejectedValueOnce(new Error('provider unavailable'))
    await user.click(screen.getByRole('button', { name: /generate deep preview/i }))
    expect(await screen.findByText(/provider unavailable/i)).toBeVisible()
    expect(screen.getByText('Quick extracted content')).toBeVisible()
  })

  it('submits the selected deep token and mode and can switch back to quick', async () => {
    const user = await quickPreview(preview('quick', 'Quick extracted content'))
    vi.mocked(apiClient.previewUrl).mockResolvedValueOnce(preview('deep', 'Deep extracted content'))
    const scrape = vi.spyOn(apiClient, 'scrapeUrl').mockResolvedValue({} as never)
    await user.click(screen.getByRole('button', { name: /generate deep preview/i }))
    expect(await screen.findByText('Deep extracted content')).toBeVisible()
    await user.click(screen.getByRole('button', { name: /quick preview/i }))
    expect(screen.getByText('Quick extracted content')).toBeVisible()
    await user.click(screen.getByRole('button', { name: /^deep preview$/i }))
    await user.click(screen.getByRole('button', { name: /^add$/i }))
    await waitFor(() => expect(scrape).toHaveBeenCalled())
    expect(scrape.mock.calls[0][7]).toBe('deep-token')
    expect(scrape.mock.calls[0][10]).toBe('deep')
  })

  it('invalidates both previews when the URL changes', async () => {
    const user = await quickPreview()
    await user.type(screen.getByLabelText(/website url/i), '?changed=1')
    expect(screen.queryByText('Quick extracted content')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^add$/i })).toBeDisabled()
  })

  it('shows prominent quality guidance for poor extraction', async () => {
    await quickPreview()
    expect(screen.getByText(/poor extraction quality/i)).toBeVisible()
    expect(screen.getByText(/try deep preview/i)).toBeVisible()
  })
})
