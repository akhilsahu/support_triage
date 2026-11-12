import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AuraRenderer } from './AuraRenderer'

describe('AuraRenderer demo data', () => {
  it('renders an inline entity without requesting the public entity API', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={client}>
        <AuraRenderer
          spaceId="demo-space"
          node={{
            type: 'service',
            entity: {
              id: 'demo-service',
              space_id: 'demo-space',
              entity_type: 'offering',
              title: 'Brand design',
              payload_json: { name: 'Brand design', description: 'A grounded demo service.' },
            },
          }}
        />
      </QueryClientProvider>,
    )

    expect(screen.getByText('Brand design')).toBeInTheDocument()
    expect(screen.getByText('A grounded demo service.')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

it('renders multiple portfolio images and handles a broken image', async () => {
  const { fireEvent } = await import('@testing-library/react')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><AuraRenderer spaceId="space" node={{ type: 'portfolio', entity: {
    id: 'portfolio', space_id: 'space', entity_type: 'portfolio_item', title: 'Studio work',
    payload_json: { media_urls: ['https://example.com/one.jpg', 'https://example.com/two.jpg'], project_url: 'javascript:alert(1)' },
  } }} /></QueryClientProvider>)
  expect(screen.getAllByRole('img')).toHaveLength(2)
  fireEvent.error(screen.getAllByRole('img')[0])
  expect(screen.getByText('Image unavailable')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'View Studio work' })).not.toBeInTheDocument()
})

it('shows unavailable details and allows a failed card request to be retried', async () => {
  const { fireEvent } = await import('@testing-library/react')
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'service', title: 'Recovered service', payload_json: {} }), { status: 200 }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><AuraRenderer spaceId="space" node={{ type: 'service', entityId: 'service' }} /></QueryClientProvider>)
  expect(await screen.findByText('These details are unavailable right now.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('Recovered service')).toBeInTheDocument()
  fetchSpy.mockRestore()
})

it('renders location and action cards with safe destinations', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}>
    <AuraRenderer spaceId="space" node={{ type: 'location', entity: { id: 'location', space_id: 'space', entity_type: 'location', title: 'Studio', payload_json: { address: 'Main Street', map_url: 'https://example.com/map' } } }} />
    <AuraRenderer spaceId="space" node={{ type: 'actions', entities: [{ id: 'action', space_id: 'space', entity_type: 'action', title: 'Contact', payload_json: { destination_url: 'mailto:hello@example.com' } }] }} />
  </QueryClientProvider>)
  expect(screen.getByText('Main Street')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Get directions' })).toHaveAttribute('href', 'https://example.com/map')
  expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', 'mailto:hello@example.com')
})

it('renders retrieved source images in chat using server-resolved references', async () => {
  const imageId = 'a'.repeat(64)
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
    id: imageId, url: 'https://example.com/cafe.jpg', caption: 'Cafe interior', sourceTitle: 'Cafe brochure',
  }), { status: 200 }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><AuraRenderer spaceId="space" node={{ type: 'images', imageIds: [imageId] }} /></QueryClientProvider>)
  expect(await screen.findByRole('img', { name: 'Cafe interior' })).toHaveAttribute('src', 'https://example.com/cafe.jpg')
  expect(screen.getByText('Source: Cafe brochure')).toBeInTheDocument()
  expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining(`/spaces/space/aura/images/${imageId}`), { cache: 'no-store' })
  fetchSpy.mockRestore()
})

it('shows a verified source link on image cards', async () => {
  const imageId = 'b'.repeat(64)
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
    id: imageId, url: 'https://example.com/jeans.jpg', title: 'Men jeans', caption: 'Men jeans',
    sourceTitle: 'Jeans collection', sourceUrl: 'https://example.com/jeans',
  }), { status: 200 }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><AuraRenderer spaceId="space" node={{ type: 'images', imageIds: [imageId] }} /></QueryClientProvider>)
  expect(await screen.findByRole('link', { name: 'Visit example.com: Men jeans' })).toHaveAttribute('href', 'https://example.com/jeans')
  expect(screen.getByRole('heading', { name: 'Men jeans' })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Men jeans' })).toBeInTheDocument()
  fetchSpy.mockRestore()
})
