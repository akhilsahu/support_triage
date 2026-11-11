import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { 
  IdentityForm, 
  identitySchema, 
  IdentityFormValues, 
  isValidWebsiteUrl, 
  normalizeWebsiteUrl 
} from './IdentityForm';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Website URL validation and normalization helpers', () => {
  it('validates proper URLs and bare domains', () => {
    expect(isValidWebsiteUrl('https://spacex.com')).toBe(true);
    expect(isValidWebsiteUrl('http://spacex.com')).toBe(true);
    expect(isValidWebsiteUrl('spacex.com')).toBe(true);
    expect(isValidWebsiteUrl('www.spacex.com')).toBe(true);
    expect(isValidWebsiteUrl('subdomain.spacex.com/about')).toBe(true);
    expect(isValidWebsiteUrl('https://localhost:3000')).toBe(true);
    expect(isValidWebsiteUrl('')).toBe(true);
    expect(isValidWebsiteUrl(null)).toBe(true);
  });

  it('rejects invalid, malformed, and unsafe URLs', () => {
    expect(isValidWebsiteUrl('spacex')).toBe(false);
    expect(isValidWebsiteUrl('https://spacex')).toBe(false);
    expect(isValidWebsiteUrl('https://')).toBe(false);
    expect(isValidWebsiteUrl('http://')).toBe(false);
    expect(isValidWebsiteUrl('invalid text with spaces')).toBe(false);
    expect(isValidWebsiteUrl('javascript:alert(1)')).toBe(false);
    expect(isValidWebsiteUrl('https://user:pass@example.com')).toBe(false);
  });

  it('normalizes bare domains by prepending https://', () => {
    expect(normalizeWebsiteUrl('spacex.com')).toBe('https://spacex.com');
    expect(normalizeWebsiteUrl('www.spacex.com')).toBe('https://www.spacex.com');
    expect(normalizeWebsiteUrl('https://spacex.com')).toBe('https://spacex.com');
    expect(normalizeWebsiteUrl('http://spacex.com')).toBe('http://spacex.com');
    expect(normalizeWebsiteUrl('')).toBe('');
    expect(normalizeWebsiteUrl('   ')).toBe('');
  });
});

describe('IdentityForm Website Input Behavior', () => {
  function TestFormWrapper({ onSubmit = vi.fn() }: { onSubmit?: (data: IdentityFormValues) => void }) {
    const form = useForm<IdentityFormValues>({
      resolver: zodResolver(identitySchema),
      mode: 'onTouched',
      defaultValues: {
        display_name: 'SpaceX',
        purpose: 'business',
        website: '',
        category: 'Aerospace',
      },
    });

    return (
      <div>
        <IdentityForm
          form={form}
          onSubmit={onSubmit}
          slug="spacex"
        />
        <button type="submit" form="identity-form">Save changes</button>
      </div>
    );
  }

  it('validates and displays error when an invalid website is typed and blurred', async () => {
    const user = userEvent.setup();
    render(<TestFormWrapper />);

    const websiteInput = screen.getByPlaceholderText(/https:\/\/spacex\.com or spacex\.com/i);
    await user.type(websiteInput, 'invalid website');
    await user.tab(); // trigger blur

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please enter a valid website address (e.g. https://spacex.com or spacex.com)'
    );
  });

  it('normalizes bare domain on blur and shows valid indicator', async () => {
    const user = userEvent.setup();
    render(<TestFormWrapper />);

    const websiteInput = screen.getByPlaceholderText(/https:\/\/spacex\.com or spacex\.com/i);
    await user.type(websiteInput, 'spacex.com');
    await user.tab(); // trigger blur

    await waitFor(() => {
      expect(websiteInput).toHaveValue('https://spacex.com');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText('Valid URL')).toBeInTheDocument();
    });
  });

  it('normalizes bare domain before form submission', async () => {
    const handleSubmit = vi.fn();
    const user = userEvent.setup();
    render(<TestFormWrapper onSubmit={handleSubmit} />);

    const websiteInput = screen.getByPlaceholderText(/https:\/\/spacex\.com or spacex\.com/i);
    await user.type(websiteInput, 'spacex.com');

    // Submit form directly
    const submitBtn = screen.getByRole('button', { name: /Save changes/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          website: 'https://spacex.com',
        })
      );
    });
  });
});
