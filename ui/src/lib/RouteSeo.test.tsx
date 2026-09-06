import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Link, MemoryRouter } from 'react-router-dom'
import html from '../../index.html?raw'
import { RouteSeo } from './RouteSeo'
import { useAppStore } from '../store/useAppStore'

const meta = (name: string) => document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"], meta[property="${name}"]`)?.content
const graph = () => JSON.parse(document.getElementById('site-structured-data')!.textContent!)['@graph'] as Record<string, any>[]

beforeEach(() => {
  sessionStorage.clear()
  document.head.innerHTML = new DOMParser().parseFromString(html, 'text/html').head.innerHTML
  useAppStore.setState({ activeHomepage: 'homepage5' })
})
afterEach(() => { cleanup(); sessionStorage.clear() })

function mount(path = '/') {
  render(<MemoryRouter initialEntries={[path]}>
    <RouteSeo />
    <Link to="/features">Features</Link>
    <Link to="/app/login">Login</Link>
    <Link to="/">Home</Link>
  </MemoryRouter>)
}

function expectSocialMatchesPage() {
  expect(meta('og:title')).toBe(document.title)
  expect(meta('twitter:title')).toBe(document.title)
  expect(meta('og:description')).toBe(meta('description'))
  expect(meta('twitter:description')).toBe(meta('description'))
}

describe('homepage-aware SEO', () => {
  it('keeps shared HTML free from a variant-specific price, FAQ, or homepage canonical', () => {
    expect(document.querySelector('link[rel="canonical"]')).toBeNull()
    expect(graph().map(item => item['@type'])).toEqual(['Organization', 'WebSite'])
    expect(meta('description')).not.toMatch(/\$\d|Start free/)
  })

  it('updates all metadata and removes stale offers when the active homepage switches', async () => {
    mount()
    await waitFor(() => expect(document.title).toContain('Shopify'))
    expect(meta('description')).toContain('$29 USD per month')
    expect(graph().find(item => item['@type'] === 'SoftwareApplication')?.offers.price).toBe(29)
    expectSocialMatchesPage()
    const titles = new Set([document.title])
    for (const homepage of ['homepage1', 'homepage2', 'homepage3', 'homepage4'] as const) {
      act(() => useAppStore.getState().setActiveHomepage(homepage))
      await waitFor(() => expect(document.title).not.toContain('Shopify'))
      titles.add(document.title)
      expectSocialMatchesPage()
      expect(meta('description')).not.toContain('$29')
      expect(graph().some(item => item['@type'] === 'SoftwareApplication')).toBe(false)
    }
    expect(titles.size).toBe(5)
    act(() => useAppStore.getState().setActiveHomepage('homepage5'))
    await waitFor(() => expect(meta('description')).toContain('$29'))
    expect(graph().find(item => item['@type'] === 'SoftwareApplication')?.offers.price).toBe(29)
    expect(document.querySelectorAll('#site-structured-data')).toHaveLength(1)
  })

  it('uses preview SEO without changing the public homepage setting', () => {
    useAppStore.setState({ activeHomepage: 'homepage2' })
    mount('/?homepage=homepage5')
    expect(document.title).toContain('Shopify')
    expect(useAppStore.getState().activeHomepage).toBe('homepage2')
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.support247.chat/')
    expectSocialMatchesPage()
  })

  it('clears page schema on private routes and restores route-specific SEO on return', async () => {
    mount()
    fireEvent.click(screen.getByText('Features'))
    await waitFor(() => expect(document.title).toContain('Features'))
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.support247.chat/features')
    expect(graph().some(item => item['@type'] === 'SoftwareApplication')).toBe(false)
    expectSocialMatchesPage()
    fireEvent.click(screen.getByText('Login'))
    await waitFor(() => expect(meta('robots')).toBe('noindex, nofollow'))
    expect(document.getElementById('site-structured-data')).toBeNull()
    fireEvent.click(screen.getByText('Home'))
    await waitFor(() => expect(document.title).toContain('Shopify'))
    expect(meta('robots')).toContain('index, follow')
    expect(graph().find(item => item['@type'] === 'SoftwareApplication')?.offers.price).toBe(29)
  })

  it('keeps pricing metadata aligned with the selected pricing UI', () => {
    mount('/pricing')
    expect(meta('description')).toContain('$29')
    act(() => useAppStore.getState().setActiveHomepage('homepage1'))
    expect(meta('description')).toContain('Start free')
    expect(graph().find(item => item['@type'] === 'SoftwareApplication')?.offers.price).toBe(0)
    expectSocialMatchesPage()
  })
})
