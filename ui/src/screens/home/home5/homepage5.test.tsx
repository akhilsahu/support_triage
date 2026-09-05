import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useDemoSequence } from './useDemoSequence'
import { AuthPage5 } from './AuthPage'
import { Pricing5 } from './Pricing'
import { PricingSection } from './components/PricingSection'
import { useHomepageVariant } from '../useHomepageVariant'
import { RouteSeo } from '../../../lib/RouteSeo'
import { useAppStore } from '../../../store/useAppStore'

beforeEach(() => {
  sessionStorage.clear()
  vi.stubGlobal(
    'matchMedia',
    vi
      .fn()
      .mockImplementation(() => ({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
  )
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('sample support conversation', () => {
  it('cancels the previous scenario when the visitor changes their choice', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useDemoSequence(false, true))
    act(() => result.current.start(0))
    act(() => vi.advanceTimersByTime(700))
    expect(result.current.step).toBe(1)
    act(() => result.current.start(2))
    expect(result.current.scenario.id).toBe('handoff')
    expect(result.current.step).toBe(0)
    for (let i = 0; i < 3; i++) act(() => vi.advanceTimersByTime(700))
    expect(result.current.status).toBe('complete')
    expect(result.current.scenario.id).toBe('handoff')
  })
  it('pauses without progressing and resumes from the same step', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useDemoSequence(false, true))
    act(() => result.current.start(1))
    act(() => result.current.pause())
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current.step).toBe(0)
    act(() => result.current.resume())
    act(() => vi.advanceTimersByTime(700))
    expect(result.current.step).toBe(1)
  })
  it('shows the complete result immediately with reduced motion', () => {
    const { result } = renderHook(() => useDemoSequence(true, true))
    act(() => result.current.start(1))
    expect(result.current.step).toBe(3)
    expect(result.current.status).toBe('complete')
  })
  it('pauses when offscreen and clears playback on unmount', () => {
    vi.useFakeTimers()
    const { result, rerender, unmount } = renderHook(
      ({ visible }) => useDemoSequence(false, visible),
      { initialProps: { visible: true } }
    )
    act(() => result.current.start(0))
    rerender({ visible: false })
    expect(result.current.status).toBe('paused')
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

function LocationResult() {
  const location = useLocation()
  return (
    <output>
      {location.pathname}
      {location.search}
      {location.hash}
    </output>
  )
}
function renderAuth(search = '?tab=register') {
  return render(
    <MemoryRouter initialEntries={[`/app/login${search}`]}>
      <Routes>
        <Route path="/app/login" element={<AuthPage5 />} />
        <Route path="*" element={<LocationResult />} />
      </Routes>
    </MemoryRouter>
  )
}
function fillRegistration() {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'test@example.com' },
  })
  fireEvent.change(
    screen.getByLabelText('Password', { exact: false, selector: 'input' }),
    { target: { value: 'test-password' } }
  )
  fireEvent.change(screen.getByLabelText('Workspace name'), {
    target: { value: 'Fern & Field' },
  })
}

describe('Homepage5 registration', () => {
  it('opens signup directly, suggests an address, and respects manual edits', () => {
    renderAuth()
    expect(
      screen.getByRole('heading', { name: 'Create your account.' })
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Workspace name'), {
      target: { value: 'Café & Field' },
    })
    const address = screen.getByRole('textbox', { name: /Workspace address/ })
    expect(address).toHaveValue('cafe-field')
    fireEvent.change(address, { target: { value: 'my-shop' } })
    fireEvent.change(screen.getByLabelText('Workspace name'), {
      target: { value: 'New name' },
    })
    expect(address).toHaveValue('my-shop')
  })
  it('shows the selected plan without claiming a subscription started', () => {
    renderAuth('?tab=register&plan=growth')
    expect(screen.getByText('Growth · $99 USD/month')).toBeInTheDocument()
    expect(screen.getByText(/Account setup only/)).toBeInTheDocument()
  })
  it('preserves form values on a collision and lets the visitor retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          detail: 'That workspace address is already taken.',
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    renderAuth()
    fillRegistration()
    fireEvent.click(screen.getByRole('button', { name: 'Create your account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already taken')
    expect(screen.getByLabelText('Email')).toHaveValue('test@example.com')
    fireEvent.change(
      screen.getByRole('textbox', { name: /Workspace address/ }),
      { target: { value: 'fern-field-two' } }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create your account' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('/app/verify-email')
    )
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).slug).toBe(
      'fern-field-two'
    )
  })
  it('prevents duplicate requests while registration is pending', async () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    renderAuth()
    fillRegistration()
    const button = screen.getByRole('button', { name: 'Create your account' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
  })
  it('shows a network failure without discarding input', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network unavailable. Please retry.'))
    )
    renderAuth()
    fillRegistration()
    fireEvent.click(screen.getByRole('button', { name: 'Create your account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Network unavailable'
    )
    expect(screen.getByLabelText('Workspace name')).toHaveValue('Fern & Field')
  })
})

describe('Homepage5 sign in', () => {
  it('submits credentials and sends a new workspace to onboarding', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'sample-token', space: { id: 'sample', slug: 'sample', display_name: 'Sample', onboarding_complete: false } }),
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAuth('?tab=login')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'member@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'sample-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in', exact: true }))
    expect(await screen.findByRole('status')).toHaveTextContent('/app/onboarding')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'member@example.com', password: 'sample-password' })
    useAppStore.setState({ token: null, spaceId: null, spaceSlug: null, spaceName: null, onboardingComplete: false })
  })
  it('focuses a failed login message and preserves entered credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ detail: 'Incorrect email or password.' }) }))
    renderAuth('?tab=login')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'member@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'sample-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in', exact: true }))
    expect(await screen.findByRole('alert')).toHaveFocus()
    expect(screen.getByLabelText('Email')).toHaveValue('member@example.com')
    expect(screen.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled()
  })
  it('preserves plan context and hides the password when switching modes', async () => {
    renderAuth('?tab=login&plan=growth&homepage=homepage5')
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')
    fireEvent.click(screen.getByRole('button', { name: 'Create your account', exact: true }))
    expect(await screen.findByRole('heading', { name: 'Create your account.' })).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.getByText('Growth · $99 USD/month')).toBeInTheDocument()
  })
})

describe('pricing, preview and metadata', () => {
  it('shows confirmed monthly prices and carries the chosen plan to signup', () => {
    render(
      <MemoryRouter>
        <PricingSection />
      </MemoryRouter>
    )
    expect(screen.getByText('$29')).toBeInTheDocument()
    expect(screen.getByText('$99')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Contact sales' })).toHaveAttribute(
      'href',
      '/contact'
    )
    const links = screen.getAllByRole('link', { name: 'Create your account' })
    expect(links[0]).toHaveAttribute(
      'href',
      '/app/login?tab=register&plan=starter'
    )
    expect(links[1]).toHaveAttribute(
      'href',
      '/app/login?tab=register&plan=growth'
    )
    expect(
      screen.queryByRole('button', { name: /annual/i })
    ).not.toBeInTheDocument()
  })
  it('redirects /pricing to its home section and preserves query context', async () => {
    render(
      <MemoryRouter
        initialEntries={['/pricing?homepage=homepage5&utm_source=sample']}
      >
        <Routes>
          <Route path="/pricing" element={<Pricing5 />} />
          <Route path="/" element={<LocationResult />} />
        </Routes>
      </MemoryRouter>
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      '/?homepage=homepage5&utm_source=sample#pricing'
    )
  })
  it('keeps a preview local while the platform homepage remains unchanged', () => {
    useAppStore.setState({ activeHomepage: 'homepage2' })
    const { result, unmount } = renderHook(() => useHomepageVariant(), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={['/?homepage=homepage5']}>
          {children}
        </MemoryRouter>
      ),
    })
    expect(result.current).toBe('homepage5')
    expect(useAppStore.getState().activeHomepage).toBe('homepage2')
    unmount()
    const next = renderHook(() => useHomepageVariant(), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={['/app/login?tab=register']}>
          {children}
        </MemoryRouter>
      ),
    })
    expect(next.result.current).toBe('homepage5')
  })
  it('uses variant metadata and restores the previous homepage metadata', async () => {
    useAppStore.setState({ activeHomepage: 'homepage5' })
    render(
      <MemoryRouter>
        <RouteSeo />
      </MemoryRouter>
    )
    await waitFor(() =>
      expect(document.title).toContain('Helpful Customer Support')
    )
    act(() => useAppStore.setState({ activeHomepage: 'homepage1' }))
    await waitFor(() =>
      expect(document.title).toContain('AI Customer Support Chatbot Platform')
    )
  })
})
