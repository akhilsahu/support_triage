import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { useAppStore } from '../../store/useAppStore'
import { DataSourceFeatureGuard } from './DataSourceFeatureGuard'

function renderGuard() {
  return render(
    <MemoryRouter>
      <DataSourceFeatureGuard><div>source page</div></DataSourceFeatureGuard>
    </MemoryRouter>,
  )
}

describe('DataSourceFeatureGuard', () => {
  afterEach(() => {
    cleanup()
    useAppStore.setState({ dataSourcesEnabled: null })
  })

  it('shows a loading state until capability bootstrap completes', () => {
    useAppStore.setState({ dataSourcesEnabled: null })
    renderGuard()

    expect(screen.getByRole('status')).toHaveTextContent(/loading data sources/i)
    expect(screen.queryByText('source page')).not.toBeInTheDocument()
  })

  it('renders the datasource route when enabled', () => {
    useAppStore.setState({ dataSourcesEnabled: true })
    renderGuard()

    expect(screen.getByText('source page')).toBeInTheDocument()
  })

  it('blocks a direct datasource route when disabled', () => {
    useAppStore.setState({ dataSourcesEnabled: false })
    renderGuard()

    expect(screen.queryByText('source page')).not.toBeInTheDocument()
    expect(screen.getByText(/disabled by an administrator/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to agents/i })).toHaveAttribute('href', '/app/agents')
  })

  it('clears capability state on logout', () => {
    useAppStore.setState({ dataSourcesEnabled: true })

    useAppStore.getState().logout()

    expect(useAppStore.getState().dataSourcesEnabled).toBeNull()
  })
})
