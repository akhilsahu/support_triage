import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { AuraMessage } from './AuraMessage'

it('renders Markdown structure and retrieved references without executing HTML or loading invented images', () => {
  const { container } = render(<AuraMessage spaceId="space" onRetry={vi.fn()} message={{
    id: 'm', role: 'aura', status: 'complete', ui: [],
    text: '**Welcome**\n\n- One\n- Two\n\n| Name | Price |\n| --- | --- |\n| Visit | Free |\n\n```js\nalert("example")\n```\n\n[Website](https://example.com)\n\n[Unsafe](javascript:alert%281%29)\n\n![Photo](https://invented.invalid/photo.jpg)\n\n<script>alert(1)</script>',
    citations: [{ id: 'ref', label: 'Source document', snippet: 'Related information' }],
  }} />)
  expect(container.querySelector('strong')?.textContent).toBe('Welcome')
  expect(screen.getByRole('table')).toBeInTheDocument()
  expect(container.querySelector('pre code')).toHaveTextContent('alert("example")')
  expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute('href', 'https://example.com/')
  expect(screen.queryByRole('link', { name: 'Unsafe' })).not.toBeInTheDocument()
  expect(container.querySelector('script')).toBeNull()
  expect(container.querySelector('img')).toBeNull()
  fireEvent.click(screen.getByText('Retrieved references (1)'))
  expect(screen.getByText('Related information')).toBeVisible()
})
