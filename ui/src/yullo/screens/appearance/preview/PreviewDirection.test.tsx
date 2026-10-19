import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PreviewDirection } from './PreviewDirection'

describe('PreviewDirection', () => {
  it('keeps Try again enabled and invokes the rebuild handler', () => {
    const rebuild = vi.fn()
    render(
      <PreviewDirection
        status="unavailable"
        isGenerating={false}
        groundedCount={0}
        lastUpdate={0}
        explanation="Could not rebuild. The current preview is unchanged."
        onRebuild={rebuild}
      />,
    )

    const button = screen.getByRole('button', { name: 'Rebuild layout with AI' })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(rebuild).toHaveBeenCalledOnce()
  })

  it('shows progress only while a rebuild request is active', () => {
    const view = render(
      <PreviewDirection
        status="unavailable"
        isGenerating
        groundedCount={0}
        lastUpdate={0}
        onRebuild={vi.fn()}
      />,
    )

    expect(view.container.querySelector('button')).toBeDisabled()
    expect(view.container).toHaveTextContent('Building a section from this Space…')
  })
})
