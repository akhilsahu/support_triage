import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LocationForm } from './LocationForm';
import { entitiesApi, type SpaceEntity } from '../api/entities';
vi.mock('../api/entities', () => ({ entitiesApi: { createEntity: vi.fn(), updateEntity: vi.fn() } }));
vi.mock('./GoogleLocationPicker', () => ({ GoogleLocationPicker: ({ onSelect }: { onSelect: (value: object) => void }) => <button type="button" onClick={() => onSelect({ lat: 12, lng: 77, address: 'Selected address' })}>Use test pin</button> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function setup(entity?: SpaceEntity) {
  const onSaved = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><LocationForm spaceId="space-a" entity={entity} onClose={vi.fn()} onSaved={onSaved} /></QueryClientProvider>);
  return { user: userEvent.setup(), onSaved };
}
it('requires name/address and saves explicitly selected coordinates with private default', async () => {
  const { user, onSaved } = setup();
  await user.click(screen.getByRole('button', { name: 'Save location' }));
  expect(entitiesApi.createEntity).not.toHaveBeenCalled();
  await user.type(screen.getByRole('textbox', { name: 'Place name' }), 'Branch A');
  await user.click(screen.getByRole('button', { name: 'Use test pin' }));
  await user.click(screen.getByRole('button', { name: 'Save location' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(entitiesApi.createEntity).toHaveBeenCalledWith('space-a', expect.objectContaining({ entity_type: 'location', is_public: false, payload_json: { name: 'Branch A', address: 'Selected address', latitude: 12, longitude: 77, map_url: 'https://www.google.com/maps/search/?api=1&query=12,77' } }));
});
it('clears stale coordinates when an address is manually changed', async () => {
  const { user, onSaved } = setup({ id: 'loc', space_id: 'space-a', entity_type: 'location', revision: 7, review_status: 'owner_confirmed', is_public: true, payload_json: { name: 'Branch A', address: 'Old address', latitude: 12, longitude: 77, map_url: 'https://www.google.com/maps/search/?api=1&query=12,77' } });
  await user.type(screen.getByRole('textbox', { name: 'Address' }), ' changed');
  await user.click(screen.getByRole('button', { name: 'Save location' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(entitiesApi.updateEntity).toHaveBeenCalledWith('space-a', 'loc', expect.objectContaining({ expected_revision: 7, payload_json: expect.objectContaining({ latitude: null, longitude: null, map_url: null, address: 'Old address changed' }) }));
});
it('preserves entered data after save failure', async () => {
  vi.mocked(entitiesApi.createEntity).mockRejectedValueOnce(new Error('offline'));
  const { user, onSaved } = setup();
  await user.type(screen.getByRole('textbox', { name: 'Place name' }), 'Branch B');
  await user.type(screen.getByRole('textbox', { name: 'Address' }), 'Manual address');
  await user.click(screen.getByRole('button', { name: 'Save location' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
  expect(onSaved).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: 'Address' })).toHaveValue('Manual address');
});
