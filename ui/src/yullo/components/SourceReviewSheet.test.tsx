import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceReviewSheet } from './SourceReviewSheet';
import type { SourceItem } from './SourceUnderstandingCard';

const api = vi.hoisted(() => ({ facts: vi.fn(), entities: vi.fn() }));
vi.mock('../api/onboarding', () => ({ yulloOnboardingApi: { getSourceFacts: api.facts } }));
vi.mock('../api/entities', () => ({ entitiesApi: { listSourceEntities: api.entities } }));
vi.mock('./DeleteSourceConfirmDialog', () => ({ DeleteSourceConfirmDialog: () => null }));

const source: SourceItem = { id: 'source-1', title: 'Company PDF', source_type: 'file', content_ref: 'company.pdf', status: 'ready', is_confirmed: true, progress: 100 };
const savedFact = { id: 'fact-1', subject: 'Company', label: 'Office', value: 'Delhi', review_status: 'owner_confirmed', source_locator: 'Page 2' };

beforeEach(() => {
  vi.clearAllMocks();
  api.facts.mockResolvedValue([savedFact]);
  api.entities.mockResolvedValue([]);
});
afterEach(cleanup);

describe('source re-extraction progress', () => {
  it('keeps previous results, follows progress without repeated detail requests, and refreshes on completion', async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    const showProgress = vi.fn();
    const props = { isOpen: true, onClose: vi.fn(), spaceId: 'space', onRetrySource: retry, onShowProgress: showProgress };
    const { rerender } = render(<SourceReviewSheet {...props} source={source} />);
    await screen.findByText('Company — Office: Delhi');
    fireEvent.click(screen.getByRole('button', { name: 'Re-extract' }));
    await waitFor(() => expect(retry).toHaveBeenCalledWith('source-1'));
    await waitFor(() => expect(showProgress).toHaveBeenCalledOnce());
    rerender(<SourceReviewSheet {...props} source={{ ...source, status: 'running', stage: 'Finding facts and useful details', progress: 91, eta_seconds: 120 }} />);
    await screen.findByText('Company — Office: Delhi');
    expect(screen.getByRole('button', { name: 'Re-extracting…' })).toBeDisabled();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '91');
    expect(screen.getByText(/91%.*about 2m left/)).toBeInTheDocument();
    expect(screen.getByText(/Showing previous results/)).toBeInTheDocument();
    await waitFor(() => expect(api.facts).toHaveBeenCalledTimes(2));
    rerender(<SourceReviewSheet {...props} source={{ ...source, status: 'running', stage: 'Finding facts and useful details', progress: 96, eta_seconds: 20 }} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '96');
    expect(api.facts).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: /Finding facts and useful details/ }));
    expect(showProgress).toHaveBeenCalledTimes(2);
    api.facts.mockResolvedValue([{ ...savedFact, value: 'Mumbai' }]);
    rerender(<SourceReviewSheet {...props} source={source} />);
    await screen.findByText('Company — Office: Mumbai');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-extract' })).toBeEnabled();
    expect(api.facts).toHaveBeenCalledTimes(3);
  });

  it('shows queued progress and leaves ETA unknown until reported', async () => {
    render(<SourceReviewSheet isOpen onClose={vi.fn()} spaceId="space" source={{ ...source, status: 'queued', progress: 0 }} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText(/Estimating time/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-extracting…' })).toBeDisabled();
    await screen.findByText('Company — Office: Delhi');
  });

  it('keeps the review open when re-extraction fails to start', async () => {
    const showProgress = vi.fn();
    render(<SourceReviewSheet isOpen onClose={vi.fn()} spaceId="space" source={source}
      onRetrySource={vi.fn().mockRejectedValue(new Error('Could not start extraction'))}
      onShowProgress={showProgress} />);
    await screen.findByText('Company — Office: Delhi');
    fireEvent.click(screen.getByRole('button', { name: 'Re-extract' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not start extraction');
    expect(showProgress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Re-extract' })).toBeEnabled();
  });
});
