import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ColouredIcon, getBrandIconFromUrl } from './ColouredIcon';

describe('ColouredIcon', () => {
  it('renders standard class name for an icon name', () => {
    const { container } = render(<ColouredIcon name="spotify" />);
    const icon = container.querySelector('i');
    expect(icon).not.toBeNull();
    expect(icon).toHaveClass('ci');
    expect(icon).toHaveClass('ci-spotify');
  });

  it('normalizes icon name if ci- prefix is already provided', () => {
    const { container } = render(<ColouredIcon name="ci-instagram" />);
    const icon = container.querySelector('i');
    expect(icon).toHaveClass('ci-instagram');
  });

  it('applies size classes appropriately', () => {
    const { container } = render(<ColouredIcon name="youtube" size="2x" className="custom-class" />);
    const icon = container.querySelector('i');
    expect(icon).toHaveClass('ci-2x');
    expect(icon).toHaveClass('ci-youtube');
    expect(icon).toHaveClass('custom-class');
  });
});

describe('getBrandIconFromUrl', () => {
  it('resolves popular social and platform URLs to their icon names', () => {
    expect(getBrandIconFromUrl('https://www.youtube.com/watch?v=123')).toBe('youtube');
    expect(getBrandIconFromUrl('https://youtu.be/123')).toBe('youtube');
    expect(getBrandIconFromUrl('https://instagram.com/user')).toBe('instagram');
    expect(getBrandIconFromUrl('https://linkedin.com/in/user')).toBe('linkedin');
    expect(getBrandIconFromUrl('https://x.com/user')).toBe('x');
    expect(getBrandIconFromUrl('https://twitter.com/user')).toBe('x');
    expect(getBrandIconFromUrl('https://spotify.com/album/123')).toBe('spotify');
    expect(getBrandIconFromUrl('https://github.com/dheereshag')).toBe('github');
    expect(getBrandIconFromUrl('https://discord.com/invite/123')).toBe('discord');
    expect(getBrandIconFromUrl('https://stripe.com')).toBe('stripe');
    expect(getBrandIconFromUrl('https://paypal.com')).toBe('paypal');
  });

  it('returns null for generic or unhandled URLs', () => {
    expect(getBrandIconFromUrl('https://example.com')).toBeNull();
    expect(getBrandIconFromUrl('')).toBeNull();
    expect(getBrandIconFromUrl(undefined)).toBeNull();
  });
});
