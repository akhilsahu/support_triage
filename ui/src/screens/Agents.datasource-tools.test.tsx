import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '../api/client'
import { useAppStore } from '../store/useAppStore'
import { Agents } from './Agents'

vi.mock('../api/client', () => ({
  apiClient: {
    listOrgAgents: vi.fn(),
    getChatbots: vi.fn(),
    listOrgDocTypes: vi.fn(),
    listAgentDataSourceTools: vi.fn(),
    replaceAgentDataSourceTools: vi.fn(),
  },
}))

vi.mock('../features/data-sources/DataSourceWizard', () => ({
  DataSourceWizard: ({ initialAgentId, onComplete }: { initialAgentId?: string; onComplete: () => void }) => (
    <div role="dialog" aria-label="Create data source">
      <span>Initial agent: {initialAgentId}</span>
      <button onClick={onComplete}>Finish source</button>
    </div>
  ),
}))

const triage = { id: 'triage-id', slug: 'triage', name: 'Triage Agent', description: 'Routes work', agent_type: 'triage', icon: 'T', is_builtin: true, active: true, system_prompt: '', temperature: 0, max_tokens: 100, rag_enabled: false, rag_doc_types: [], rag_top_k: 3, keywords: [], kb_ids: [], llm_model: null, reasoning_effort: null }
const builtin = { ...triage, id: 'support-id', slug: 'support', name: 'Support Agent', agent_type: 'support', icon: 'S' }
const custom = { ...triage, id: 'custom-id', slug: 'orders', name: 'Orders Agent', agent_type: 'custom', icon: 'O', is_builtin: false }
const response = (agentId: string) => ({
  chatbot_id: 'chatbot-1',
  agent_kind: agentId === custom.id ? 'custom' : 'builtin',
  agent_id: agentId,
  tools: [{ id: 'orders-tool', name: 'orders_lookup', display_name: 'Orders API', connection_name: 'Commerce', method: 'GET', path: '/orders', assigned: true }],
})

function renderAgents() {
  return render(<MemoryRouter><Agents /></MemoryRouter>)
}

describe('Agents data source tools', () => {
  beforeEach(() => {
    useAppStore.setState({ currentChatbotId: 'chatbot-1', dataSourcesEnabled: true })
    vi.mocked(apiClient.listOrgAgents).mockResolvedValue([triage, builtin, custom])
    vi.mocked(apiClient.getChatbots).mockResolvedValue([{ id: 'chatbot-1', slug: 'main', is_default: true }])
    vi.mocked(apiClient.listOrgDocTypes).mockResolvedValue({ doc_types: [] })
    vi.mocked(apiClient.listAgentDataSourceTools).mockImplementation((_kind, id) => Promise.resolve(response(id) as never))
    vi.mocked(apiClient.replaceAgentDataSourceTools).mockResolvedValue({ assignments: [] } as never)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('does not render or request datasource controls when the capability is disabled', async () => {
    useAppStore.setState({ dataSourcesEnabled: false })
    renderAgents()
    await screen.findByText('Support Agent')
    expect(screen.queryByText('Plug data source')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /data sources/i })).not.toBeInTheDocument()
    expect(apiClient.listAgentDataSourceTools).not.toHaveBeenCalled()
  })

  it('loads current registry assignments on expansion for non-triage agents', async () => {
    const user = userEvent.setup()
    renderAgents()
    const supportCard = (await screen.findByText('Support Agent')).closest('.flex-col') as HTMLElement
    const ordersCard = screen.getByText('Orders Agent').closest('.flex-col') as HTMLElement
    expect(within(screen.getByText('Triage Agent').closest('.flex-col') as HTMLElement).queryByRole('button', { name: /data sources/i })).not.toBeInTheDocument()

    await user.click(within(supportCard).getByRole('button', { name: /data sources/i }))
    expect(await within(supportCard).findByText('Orders API')).toBeInTheDocument()
    await user.click(within(ordersCard).getByRole('button', { name: /data sources/i }))
    expect(await within(ordersCard).findByText('Orders API')).toBeInTheDocument()

    expect(apiClient.listAgentDataSourceTools).toHaveBeenCalledWith('builtin', builtin.id, 'chatbot-1')
    expect(apiClient.listAgentDataSourceTools).toHaveBeenCalledWith('custom', custom.id, 'chatbot-1')
  })

  it('hands creation to the wizard without nesting dialogs, then reopens a refreshed picker', async () => {
    const user = userEvent.setup()
    renderAgents()
    const supportCard = (await screen.findByText('Support Agent')).closest('.flex-col') as HTMLElement
    await user.click(within(supportCard).getByRole('button', { name: /data sources/i }))
    await user.click(await within(supportCard).findByRole('button', { name: /plug data source/i }))
    expect(await screen.findByRole('dialog', { name: /plug data sources into support agent/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /create new data source/i }))
    expect(screen.queryByRole('dialog', { name: /plug data sources/i })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: /create data source/i })).toHaveTextContent(`Initial agent: ${builtin.id}`)

    await user.click(screen.getByRole('button', { name: /finish source/i }))
    expect(await screen.findByRole('dialog', { name: /plug data sources into support agent/i })).toBeInTheDocument()
    await waitFor(() => expect(vi.mocked(apiClient.listAgentDataSourceTools).mock.calls.length).toBeGreaterThanOrEqual(3))
  })
})
