import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Prose } from '@/components/store/Prose'

afterEach(cleanup)

describe('Prose', () => {
  it('renders the title as an h1 and shows its children', () => {
    render(
      <Prose title="Colophon">
        <p>body copy here</p>
      </Prose>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Colophon' })).toBeTruthy()
    expect(screen.getByText('body copy here')).toBeTruthy()
  })
})
