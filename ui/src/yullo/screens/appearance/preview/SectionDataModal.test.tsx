import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi, beforeAll } from 'vitest'
import { SectionDataModal } from './SectionDataModal'
import type { AppearancePreviewSection } from './types'

describe('SectionDataModal', () => {
  afterEach(() => {
    cleanup()
  })

  beforeAll(() => {
    // HTMLDialogElement polyfill for JSDOM
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true
    })
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false
    })
  })

  const sampleSectionData: AppearancePreviewSection = {
    type: 'services',
    heading: 'Core Services',
    eyebrow: 'What We Offer',
    items: [
      {
        key: 'services:item-1:0',
        title: 'Custom Advisory',
        description: 'End-to-end consulting for high-growth teams.',
        meta: '$5,000 / mo',
        source: 'grounded',
        sourceEntityId: 'ent-1',
      },
      {
        key: 'services:item-2:1',
        title: 'Technical Triage',
        description: 'Immediate incident review and system stabilization.',
        meta: '24/7 SLA',
        source: 'grounded',
        sourceEntityId: 'ent-2',
      },
    ],
  }

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <SectionDataModal
        isOpen={false}
        sectionType="services"
        sectionLabel="Services"
        isLoading={false}
        isApplying={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(container.querySelector('dialog')).toBeNull()
  })

  it('renders loading state with title and skeleton when pulling data', () => {
    render(
      <SectionDataModal
        isOpen={true}
        sectionType="services"
        sectionLabel="Services"
        isLoading={true}
        isApplying={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('Pulling Services data…')).toBeInTheDocument()
    expect(
      screen.getByText('Aura is retrieving grounded details from your Space knowledge to draft this section.'),
    ).toBeInTheDocument()
  })

  it('renders pulled data items and confirms when "Add to section" is clicked', () => {
    const confirmSpy = vi.fn()
    const cancelSpy = vi.fn()

    render(
      <SectionDataModal
        isOpen={true}
        sectionType="services"
        sectionLabel="Services"
        isLoading={false}
        isApplying={false}
        sectionData={sampleSectionData}
        onConfirm={confirmSpy}
        onCancel={cancelSpy}
      />,
    )

    expect(screen.getByText('Review pulled Services data')).toBeInTheDocument()
    expect(screen.getByText('Core Services')).toBeInTheDocument()
    expect(screen.getByText('What We Offer')).toBeInTheDocument()
    expect(screen.getByText('Custom Advisory')).toBeInTheDocument()
    expect(screen.getByText('End-to-end consulting for high-growth teams.')).toBeInTheDocument()
    expect(screen.getByText('$5,000 / mo')).toBeInTheDocument()
    expect(screen.getByText('Technical Triage')).toBeInTheDocument()

    const confirmBtn = screen.getByRole('button', { name: /Add to section/i })
    expect(confirmBtn).toBeEnabled()
    fireEvent.click(confirmBtn)
    expect(confirmSpy).toHaveBeenCalledOnce()
  })

  it('calls onCancel when Cancel button is clicked', () => {
    const cancelSpy = vi.fn()

    render(
      <SectionDataModal
        isOpen={true}
        sectionType="services"
        sectionLabel="Services"
        isLoading={false}
        isApplying={false}
        sectionData={sampleSectionData}
        onConfirm={vi.fn()}
        onCancel={cancelSpy}
      />,
    )

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' })
    fireEvent.click(cancelBtn)
    expect(cancelSpy).toHaveBeenCalledOnce()
  })

  it('displays explanation and hides Add to section button when insufficient context is returned', () => {
    render(
      <SectionDataModal
        isOpen={true}
        sectionType="services"
        sectionLabel="Services"
        isLoading={false}
        isApplying={false}
        status="insufficient_context"
        explanation="Add or confirm details for this section in Knowledge, then build again."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('No data found for Services')).toBeInTheDocument()
    expect(
      screen.getByText('Add or confirm details for this section in Knowledge, then build again.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add to section/i })).toBeNull()
  })
})
