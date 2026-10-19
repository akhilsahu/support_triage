import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BookingForm } from './BookingForm';
import { entitiesApi, SpaceEntity } from '../api/entities';

vi.mock('../api/entities', () => ({ entitiesApi: { createEntity: vi.fn(), updateEntity: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function setup(entity?: SpaceEntity) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    <BookingForm spaceId="space-a" spaceName="Northstar" entity={entity} onClose={onClose} onSaved={onSaved} />
  </QueryClientProvider>);
  return { user: userEvent.setup(), onClose, onSaved };
}

describe('Home booking editor', () => {
  it('validates before sending and defaults to private', async () => {
    const { user, onSaved } = setup();
    await user.click(screen.getByRole('button', { name: 'Save booking link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTPS');
    expect(entitiesApi.createEntity).not.toHaveBeenCalled();
    await user.type(screen.getByRole('textbox', { name: 'Booking URL' }), 'https://booking.example/intro');
    await user.click(screen.getByRole('button', { name: 'Save booking link' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(entitiesApi.createEntity).toHaveBeenCalledWith('space-a', expect.objectContaining({
      identity_key: expect.any(String), entity_type: 'action', is_public: false,
      payload_json: { label: 'Book a call', kind: 'booking', destination_url: 'https://booking.example/intro' },
    }));
  });

  it('retains input after failure and reuses the same identity on retry', async () => {
    vi.mocked(entitiesApi.createEntity).mockRejectedValueOnce(new Error('offline'));
    const { user, onSaved } = setup();
    await user.type(screen.getByRole('textbox', { name: 'Booking URL' }), 'https://booking.example/intro');
    await user.click(screen.getByRole('switch', { name: 'Enable for visitors' }));
    await user.click(screen.getByRole('button', { name: 'Save booking link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Booking URL' })).toHaveValue('https://booking.example/intro');
    await user.click(screen.getByRole('button', { name: 'Save booking link' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const calls = vi.mocked(entitiesApi.createEntity).mock.calls;
    expect(calls[0][1]).toEqual(calls[1][1]);
    expect(calls[1][1].is_public).toBe(true);
  });

  it('requires explicit discard for unsaved input', async () => {
    const { user, onClose } = setup();
    await user.type(screen.getByRole('textbox', { name: 'Button label' }), ' today');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('Discard your unsaved booking link?')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it.each(['http://booking.example', 'https://user:secret@booking.example', 'javascript:alert(1)'])('rejects unsafe URL %s', async url => {
    const { user } = setup();
    await user.type(screen.getByRole('textbox', { name: 'Booking URL' }), url);
    await user.click(screen.getByRole('button', { name: 'Save booking link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTPS');
    expect(entitiesApi.createEntity).not.toHaveBeenCalled();
  });
});

const existing: SpaceEntity = { id: 'booking-a', space_id: 'space-a', entity_type: 'action', revision: 4, is_public: true, review_status: 'owner_confirmed', payload_json: { label: 'Consultation', destination_url: 'https://booking.example/intro', kind: 'booking', organization: 'Northstar', purpose: 'Initial consultation', relationship: 'space_owner' } };

it('edits with the saved revision and preserves contextual fields', async () => {
  const { user, onSaved } = setup(existing);
  expect(screen.getByRole('textbox', { name: 'Button label' })).toHaveValue('Consultation');
  await user.click(screen.getByRole('switch', { name: 'Enable for visitors' }));
  await user.click(screen.getByRole('button', { name: 'Save booking link' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(entitiesApi.updateEntity).toHaveBeenCalledWith('space-a', 'booking-a', {
    expected_revision: 4, payload_json: existing.payload_json, is_public: false,
  });
  expect(entitiesApi.createEntity).not.toHaveBeenCalled();
});

it('retains edited values on a revision conflict without retrying a stale update', async () => {
  vi.mocked(entitiesApi.updateEntity).mockRejectedValueOnce({ response: { status: 409 } });
  const { user, onSaved } = setup(existing);
  await user.type(screen.getByRole('textbox', { name: 'Button label' }), ' today');
  await user.click(screen.getByRole('button', { name: 'Save booking link' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('changed elsewhere');
  expect(screen.getByRole('textbox', { name: 'Button label' })).toHaveValue('Consultation today');
  expect(onSaved).not.toHaveBeenCalled();
  expect(entitiesApi.updateEntity).toHaveBeenCalledOnce();
});
