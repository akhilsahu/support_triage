import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { entitiesApi, SpaceEntity } from '../api/entities';
import { BookingLinks } from './BookingLinks';

vi.mock('../api/entities', () => ({ entitiesApi: { listEntities: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('loads only when opened and separates approved bookings from suggestions and other entities', async () => {
  const base: SpaceEntity = { id: 'approved', space_id: 'space-a', entity_type: 'action', revision: 1, is_public: false, review_status: 'owner_confirmed', payload_json: { label: 'Consultation', kind: 'booking', destination_url: 'https://booking.example/intro' } };
  vi.mocked(entitiesApi.listEntities).mockResolvedValue([
    base,
    { ...base, id: 'candidate', review_status: 'extracted', payload_json: { ...base.payload_json, label: 'Unreviewed' } },
    { ...base, id: 'other', entity_type: 'contact_channel', payload_json: { label: 'Official site' } },
  ]);
  render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><BookingLinks spaceId="space-a" spaceName="Northstar" /></QueryClientProvider></MemoryRouter>);
  expect(entitiesApi.listEntities).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Manage booking links' }));
  expect(await screen.findByText('Consultation')).toBeInTheDocument();
  expect(screen.getByText('Private')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open booking page for Consultation' })).toHaveAttribute('href', 'https://booking.example/intro');
  expect(screen.getByRole('link', { name: /Review suggested/ })).toHaveAttribute('href', '/yullo/spaces/space-a/aura-knowledge');
  expect(screen.queryByText('Official site')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Edit Unreviewed' })).not.toBeInTheDocument();
});
