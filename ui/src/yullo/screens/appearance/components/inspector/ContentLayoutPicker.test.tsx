import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContentLayoutPicker } from './ContentLayoutPicker'

afterEach(() => {
  cleanup()
})

describe('ContentLayoutPicker', () => {
  it('renders all four layout options: left, center, right, stretch', () => {
    const handleChange = vi.fn()
    render(<ContentLayoutPicker value="center" onChange={handleChange} />)

    expect(screen.getByRole('radio', { name: /left/i })).toBeDefined()
    expect(screen.getByRole('radio', { name: /center/i })).toBeDefined()
    expect(screen.getByRole('radio', { name: /right/i })).toBeDefined()
    expect(screen.getByRole('radio', { name: /stretch/i })).toBeDefined()
  })

  it('marks current selection as checked', () => {
    const handleChange = vi.fn()
    render(<ContentLayoutPicker value="left" onChange={handleChange} />)

    const leftBtn = screen.getByRole('radio', { name: /left/i })
    const centerBtn = screen.getByRole('radio', { name: /center/i })

    expect(leftBtn.getAttribute('aria-checked')).toBe('true')
    expect(centerBtn.getAttribute('aria-checked')).toBe('false')
  })

  it('fires onChange when an option is clicked', () => {
    const handleChange = vi.fn()
    render(<ContentLayoutPicker value="center" onChange={handleChange} />)

    const rightBtn = screen.getByRole('radio', { name: /right/i })
    fireEvent.click(rightBtn)

    expect(handleChange).toHaveBeenCalledWith('right')

    const stretchBtn = screen.getByRole('radio', { name: /stretch/i })
    fireEvent.click(stretchBtn)

    expect(handleChange).toHaveBeenCalledWith('stretch')
  })
})
