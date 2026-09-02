import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '../../api/client'
import { DataSourceToolPicker } from './DataSourceToolPicker'

vi.mock('../../api/client', () => ({
  apiClient: {
    listAgentDataSourceTools: vi.fn(),
    replaceAgentDataSourceTools: vi.fn(),
  },
}))

const agent = { id: 'agent-1', name: 'Support specialist', is_builtin: false }
const chatbotId = 'chatbot-1'
const tools = [
  { id: 'orders', name: 'orders', display_name: 'Orders API', method: 'GET', path: '/orders', connection_name: 'Commerce', assigned: false },
  { id: 'refunds', name: 'refunds', display_name: 'Refund lookup', method: 'POST', path: '/refunds/search', connection_name: 'Payments', assigned: true },
]

function renderPicker(overrides: Partial<ComponentProps<typeof DataSourceToolPicker>> = {}) {
  const props = { agent, chatbotId, onClose: vi.fn(), onSaved: vi.fn(), onCreateSource: vi.fn(), ...overrides }
  render(<DataSourceToolPicker {...props} />)
  return props
}

describe('DataSourceToolPicker', () => {
  beforeEach(() => {
    vi.mocked(apiClient.listAgentDataSourceTools).mockResolvedValue({ chatbot_id: chatbotId, agent_kind: 'custom', agent_id: agent.id, tools })
    vi.mocked(apiClient.replaceAgentDataSourceTools).mockResolvedValue({ chatbot_id: chatbotId, agent_kind: 'custom', agent_id: agent.id, assignments: [] })
  })
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('loads assignments, searches across tool metadata, and saves one replacement', async () => {
    const user = userEvent.setup()
    renderPicker()
    expect(await screen.findByLabelText('Refund lookup')).toBeChecked()
    expect(screen.getByLabelText('Orders API')).not.toBeChecked()

    await user.type(screen.getByRole('searchbox'), 'commerce')
    expect(screen.getByLabelText('Orders API')).toBeInTheDocument()
    expect(screen.queryByLabelText('Refund lookup')).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('Orders API'))
    await user.clear(screen.getByRole('searchbox'))
    await user.click(screen.getByLabelText('Refund lookup'))
    await user.click(screen.getByRole('button', { name: /save assignments/i }))

    expect(apiClient.replaceAgentDataSourceTools).toHaveBeenCalledWith('custom', agent.id, {
      chatbot_id: chatbotId,
      tool_ids: ['orders'],
    })
  })

  it('shows loading, retryable error, empty, and no-results states', async () => {
    let reject!: (reason: Error) => void
    vi.mocked(apiClient.listAgentDataSourceTools).mockReturnValueOnce(new Promise((_resolve, rejection) => { reject = rejection }))
    renderPicker()
    expect(screen.getByRole('status')).toHaveTextContent(/loading data source tools/i)
    reject(new Error('Network unavailable'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable')
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    cleanup()

    vi.mocked(apiClient.listAgentDataSourceTools).mockResolvedValueOnce({ chatbot_id: chatbotId, agent_kind: 'custom', agent_id: agent.id, tools: [] })
    renderPicker()
    expect(await screen.findByText(/no active data source tools/i)).toBeInTheDocument()
    cleanup()

    renderPicker()
    await userEvent.type(await screen.findByRole('searchbox'), 'missing')
    expect(screen.getByText(/no tools match your search/i)).toBeInTheDocument()
  })

  it('hands off creation after closing and never mutates a tool directly', async () => {
    const user = userEvent.setup()
    const props = renderPicker()
    await screen.findByLabelText('Refund lookup')
    await user.click(screen.getByLabelText('Refund lookup'))
    expect(apiClient.replaceAgentDataSourceTools).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /create new data source/i }))
    expect(props.onClose).toHaveBeenCalledTimes(1)
    expect(props.onCreateSource).toHaveBeenCalledTimes(1)
  })

  it('retries loading and refreshes after stale-tool validation errors', async () => {
    const user = userEvent.setup()
    vi.mocked(apiClient.listAgentDataSourceTools).mockRejectedValueOnce(new Error('Try again'))
    renderPicker()
    await user.click(await screen.findByRole('button', { name: /retry/i }))
    expect(await screen.findByLabelText('Orders API')).toBeInTheDocument()

    vi.mocked(apiClient.replaceAgentDataSourceTools).mockRejectedValueOnce({ response: { status: 422, data: { detail: 'Tool became inactive' } } })
    await user.click(screen.getByRole('button', { name: /save assignments/i }))
    await waitFor(() => expect(apiClient.listAgentDataSourceTools).toHaveBeenCalledTimes(3))
  })
})
