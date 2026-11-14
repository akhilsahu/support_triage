import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { entitiesApi } from '../api/entities';
import { Locations } from './Locations';
vi.mock('../api/entities', () => ({ entitiesApi: { listEntities: vi.fn() } }));
vi.mock('./LocationForm', () => ({ LocationForm: ({ entity }: { entity?: { id: string } }) => <p>Editing {entity?.id || 'new'}</p> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('lists multiple branches independently and edits only the selected record', async () => {
  const base = { space_id: 's', entity_type: 'location', revision: 2, review_status: 'owner_confirmed', is_public: true };
  vi.mocked(entitiesApi.listEntities).mockResolvedValue([
    { ...base, id: 'a', payload_json: { name: 'Branch A', address: 'First address' } },
    { ...base, id: 'b', is_public: false, payload_json: { name: 'Branch B', address: 'Second address' } },
  ]);
  render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><Locations spaceId="s" /></QueryClientProvider></MemoryRouter>);
  expect(await screen.findByText('Branch A')).toBeInTheDocument();
  expect(screen.getByText('Branch B')).toBeInTheDocument();
  expect(screen.getByText('Public')).toBeInTheDocument();
  expect(screen.getByText('Private')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Edit Branch B' }));
  expect(screen.getByText('Editing b')).toBeInTheDocument();
});
