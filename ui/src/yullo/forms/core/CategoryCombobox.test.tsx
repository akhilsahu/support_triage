import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CategoryCombobox } from './CategoryCombobox';
import { formsApi } from '../../api/forms';

vi.mock('../../api/forms', () => ({
  formsApi: {
    getCategorySuggestions: vi.fn(),
  },
}));

const mockDbSuggestions = [
  { id: '1', name: 'E-commerce & Retail', purpose: 'business', is_popular: true, usage_count: 10 },
  { id: '2', name: 'E-commerce', purpose: 'business', is_popular: true, usage_count: 8 },
  { id: '3', name: 'SaaS & Software', purpose: 'business', is_popular: true, usage_count: 5 },
  { id: '4', name: 'Healthcare & Medical', purpose: 'business', is_popular: false, usage_count: 2 },
];

beforeEach(() => {
  vi.mocked(formsApi.getCategorySuggestions).mockImplementation(async (q?: string) => {
    if (!q || !q.trim()) return mockDbSuggestions;
    const clean = q.trim().toLowerCase();
    return mockDbSuggestions.filter((item) => item.name.toLowerCase().includes(clean));
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CategoryCombobox', () => {
  it('renders input with default value and placeholder', () => {
    render(
      <CategoryCombobox
        value="E commerce"
        onChange={vi.fn()}
        purpose="business"
        placeholder="Enter category"
      />
    );

    const input = screen.getByRole('combobox');
    expect(input).toHaveValue('E commerce');
    expect(input).toHaveAttribute('placeholder', 'Enter category');
  });

  it('opens suggestion list from DB store on focus and calls API', async () => {
    const user = userEvent.setup();
    render(
      <CategoryCombobox
        value=""
        onChange={vi.fn()}
        purpose="business"
      />
    );

    const input = screen.getByRole('combobox');
    await user.click(input);

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await waitFor(() => {
      expect(formsApi.getCategorySuggestions).toHaveBeenCalledWith('', 'business', 35);
      expect(screen.getByText('E-commerce & Retail')).toBeInTheDocument();
      expect(screen.getByText('SaaS & Software')).toBeInTheDocument();
    });
  });

  it('filters suggestions when typing and selects an option', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    function ControlledWrapper() {
      const [val, setVal] = useState('');
      return (
        <CategoryCombobox
          value={val}
          onChange={(newVal) => {
            setVal(newVal);
            handleChange(newVal);
          }}
          purpose="business"
        />
      );
    }

    render(<ControlledWrapper />);
    const input = screen.getByRole('combobox');

    await user.type(input, 'E-commerce');
    expect(handleChange).toHaveBeenCalled();

    const option = await screen.findByRole('option', { name: /E-commerce & Retail/ });
    expect(option).toBeInTheDocument();

    await user.click(option);
    expect(handleChange).toHaveBeenLastCalledWith('E-commerce & Retail');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('allows user to type and choose a custom category not in the DB store', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    function ControlledWrapper() {
      const [val, setVal] = useState('');
      return (
        <CategoryCombobox
          value={val}
          onChange={(newVal) => {
            setVal(newVal);
            handleChange(newVal);
          }}
          purpose="business"
        />
      );
    }

    render(<ControlledWrapper />);
    const input = screen.getByRole('combobox');

    await user.type(input, 'Custom Rocket Propulsion');

    // Should display option to use custom category
    expect(await screen.findByText(/Use custom:/)).toBeInTheDocument();
    expect(screen.getByText('"Custom Rocket Propulsion"')).toBeInTheDocument();

    // Selecting custom option
    const customItem = screen.getByText('"Custom Rocket Propulsion"');
    await user.click(customItem);

    expect(input).toHaveValue('Custom Rocket Propulsion');
    expect(handleChange).toHaveBeenLastCalledWith('Custom Rocket Propulsion');
  });

  it('supports keyboard navigation with ArrowDown, ArrowUp, and Enter', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    function ControlledWrapper() {
      const [val, setVal] = useState('');
      return (
        <CategoryCombobox
          value={val}
          onChange={(newVal) => {
            setVal(newVal);
            handleChange(newVal);
          }}
          purpose="business"
        />
      );
    }

    render(<ControlledWrapper />);
    const input = screen.getByRole('combobox');

    await user.click(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('E-commerce & Retail')).toBeInTheDocument();
    });

    // Press ArrowDown to highlight and Enter to select
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(handleChange).toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('clears category when clear button is clicked', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(
      <CategoryCombobox
        value="Existing Category"
        onChange={handleChange}
        purpose="business"
      />
    );

    const clearBtn = screen.getByLabelText('Clear category');
    await user.click(clearBtn);

    expect(handleChange).toHaveBeenCalledWith('');
  });
});
