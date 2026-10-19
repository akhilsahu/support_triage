import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InlineEditableText } from './InlineEditableText'
import { SectionEditorContext } from '../preview/SectionEditorContext'

afterEach(() => {
  cleanup()
})

const mockEditorContext = {
  generating: false,
  toggle: vi.fn(),
  build: vi.fn(),
  updateSectionHeading: vi.fn(),
  updateSectionItem: vi.fn(),
}

describe('InlineEditableText', () => {
  it('renders static text without editing capability in public view', () => {
    const handleSave = vi.fn()
    const { container } = render(
      <InlineEditableText value="Launch Vehicles" onSave={handleSave} as="h3" />,
    )

    const heading = container.querySelector('h3')
    expect(heading).toBeInTheDocument()
    expect(heading).toHaveTextContent('Launch Vehicles')
    expect(heading).not.toHaveClass('appearance-editable-text')

    // Clicking does not open input
    fireEvent.click(heading!)
    expect(container.querySelector('input')).not.toBeInTheDocument()
  })

  it('renders null in public view when value is empty', () => {
    const { container } = render(
      <InlineEditableText value="" onSave={vi.fn()} as="p" />,
    )
    expect(container.querySelector('p')).not.toBeInTheDocument()
  })

  it('enters editing mode on click and saves on Enter in editor view', () => {
    const handleSave = vi.fn()
    render(
      <SectionEditorContext.Provider value={mockEditorContext}>
        <InlineEditableText value="Original Title" onSave={handleSave} as="h3" />
      </SectionEditorContext.Provider>,
    )

    const editable = screen.getByRole('button', { name: /edit original title/i })
    expect(editable).toHaveClass('appearance-editable-text')

    fireEvent.click(editable)

    const input = screen.getByRole('textbox')
    expect(input).toBeInTheDocument()
    expect(input).toHaveValue('Original Title')

    fireEvent.change(input, { target: { value: 'Updated Starship Title' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    expect(handleSave).toHaveBeenCalledWith('Updated Starship Title')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('cancels editing on Escape without calling onSave', () => {
    const handleSave = vi.fn()
    render(
      <SectionEditorContext.Provider value={mockEditorContext}>
        <InlineEditableText value="Original Title" onSave={handleSave} as="h3" />
      </SectionEditorContext.Provider>,
    )

    const editable = screen.getByRole('button', { name: /edit original title/i })
    fireEvent.click(editable)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Something Else' } })
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' })

    expect(handleSave).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('commits changes on blur', () => {
    const handleSave = vi.fn()
    render(
      <SectionEditorContext.Provider value={mockEditorContext}>
        <InlineEditableText value="Original Description" onSave={handleSave} multiline />
      </SectionEditorContext.Provider>,
    )

    const editable = screen.getByRole('button')
    fireEvent.click(editable)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'New multiline description' } })
    fireEvent.blur(textarea)

    expect(handleSave).toHaveBeenCalledWith('New multiline description')
  })
})
