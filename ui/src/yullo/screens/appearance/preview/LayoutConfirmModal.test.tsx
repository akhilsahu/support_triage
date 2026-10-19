import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { LayoutConfirmModal } from './LayoutConfirmModal'
import { defaultPresentationConfig } from '../presentation/schema'
import type { AppearancePreviewContent } from './types'

describe('LayoutConfirmModal', () => {
  afterEach(() => {
    cleanup()
  })

  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true
    })
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false
    })
  })
  const dummyConfig = defaultPresentationConfig('business')
  const dummyPreviewContent: AppearancePreviewContent = {
    schemaVersion: 1,
    sections: [
      {
        type: 'services',
        heading: 'SpaceX Launch Vehicles',
        items: [
          {
            key: 'item-1',
            title: 'Falcon 9',
            description: 'Reusable two-stage rocket.',
            source: 'grounded',
            sourceEntityId: 'e-1',
            meta: 'ORBITAL',
          },
        ],
      },
    ],
  }

  it('renders layout decisions and section items', () => {
    render(
      <LayoutConfirmModal
        isOpen
        isLoading={false}
        config={dummyConfig}
        previewContent={dummyPreviewContent}
        explanation="Tailored SpaceX layout generated"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('Review Generated Layout & Content')).toBeInTheDocument()
    expect(screen.getByText('Tailored SpaceX layout generated')).toBeInTheDocument()
    expect(screen.getByText('SpaceX Launch Vehicles')).toBeInTheDocument()
    expect(screen.getByText('Falcon 9')).toBeInTheDocument()
    expect(screen.getByText('Reusable two-stage rocket.')).toBeInTheDocument()
    expect(screen.getByText('ORBITAL')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm & apply to preview/i })).toBeInTheDocument()
  })

  it('invokes onConfirm when confirm button is clicked', () => {
    const handleConfirm = vi.fn()
    render(
      <LayoutConfirmModal
        isOpen
        isLoading={false}
        config={dummyConfig}
        previewContent={dummyPreviewContent}
        onConfirm={handleConfirm}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /confirm & apply to preview/i }))
    expect(handleConfirm).toHaveBeenCalledOnce()
  })

  it('invokes onCancel when cancel button is clicked', () => {
    const handleCancel = vi.fn()
    render(
      <LayoutConfirmModal
        isOpen
        isLoading={false}
        config={dummyConfig}
        previewContent={dummyPreviewContent}
        onConfirm={vi.fn()}
        onCancel={handleCancel}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(handleCancel).toHaveBeenCalledOnce()
  })
})
