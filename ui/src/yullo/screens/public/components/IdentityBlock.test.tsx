import React from 'react'
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { IdentityBlock } from './IdentityBlock'
import type { PublicSpace } from '../../../services/aura/types'
afterEach(cleanup)
const space: PublicSpace = { handle: 'studio', displayName: 'Studio', description: 'Design', auraEnabled: true }
it('renders saved booking destinations alongside identity', () => {
  render(<IdentityBlock space={{ ...space, bookingLinks: [{ id: '1', label: 'Book a call', url: 'https://booking.example/call' }] }} />)
  expect(screen.getByRole('heading', { name: 'Studio' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Book a call' })).toHaveAttribute('href', 'https://booking.example/call')
  expect(screen.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer')
})
it('renders no placeholder bookings when absent or invalid', () => {
  const { rerender } = render(<IdentityBlock space={space} />)
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  rerender(<IdentityBlock space={{ ...space, bookingLinks: [{ id: '1', label: 'Bad link', url: 'javascript:alert(1)' }] }} />)
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})
