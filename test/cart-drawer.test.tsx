import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { CartProvider, useCart, type CartLine } from '@/components/cart/CartContext'
import { CartDrawer } from '@/components/cart/CartDrawer'

beforeAll(() => { process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co' })
afterEach(() => { cleanup(); localStorage.clear() })

const line = (over: Partial<CartLine> = {}): CartLine => ({
  photoId: 'p1', slug: 'a-photo', title: 'A Photo', altText: 'alt', size: '8x10', register: 'colour', qty: 1, ...over,
})

function Harness({ seed }: { seed: CartLine[] }) {
  const { add, open } = useCart()
  return <button onClick={() => { seed.forEach(add); open() }}>boot</button>
}
function setup(seed: CartLine[] = []) {
  const utils = render(
    <CartProvider>
      <Harness seed={seed} />
      <CartDrawer />
    </CartProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'boot' }))
  return utils
}

describe('CartDrawer', () => {
  it('renders nothing until opened', () => {
    render(<CartProvider><CartDrawer /></CartProvider>)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is a labelled modal dialog when open', () => {
    setup([line()])
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
  })

  it('moves focus into the dialog (the Close button) on open', () => {
    setup([line()])
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close')
  })

  it('shows an honest empty state', () => {
    setup([])
    expect(screen.getByText(/your selection is empty/i)).toBeTruthy()
  })

  it('renders a row per line with title and line price', () => {
    setup([line(), line({ size: '4x6', title: 'Second' })]) // $15 and $5, subtotal $20
    expect(screen.getByText('A Photo')).toBeTruthy()
    expect(screen.getByText('Second')).toBeTruthy()
    expect(screen.getByText('$15')).toBeTruthy()
    expect(screen.getByText('$5')).toBeTruthy()
    expect(screen.getByText('$20')).toBeTruthy()
  })

  it('increments and decrements quantity with the stepper', () => {
    setup([line({ qty: 2 })])
    const stepper = screen.getByRole('group', { name: /quantity for/i })
    fireEvent.click(within(stepper).getByRole('button', { name: 'Increase quantity' }))
    expect(within(stepper).getByText('3')).toBeTruthy()
    fireEvent.click(within(stepper).getByRole('button', { name: 'Decrease quantity' }))
    fireEvent.click(within(stepper).getByRole('button', { name: 'Decrease quantity' }))
    expect(within(stepper).getByText('1')).toBeTruthy() // clamped at 1
  })

  it('removes a line', () => {
    setup([line()])
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByText(/your selection is empty/i)).toBeTruthy()
  })

  it('shows subtotal only — no shipping/tax/total line (D1/D2)', () => {
    setup([line({ qty: 2 })])
    expect(screen.getByText('Subtotal')).toBeTruthy()
    expect(screen.getByText(/calculated at checkout/i)).toBeTruthy()
    expect(screen.queryByText(/^total$/i)).toBeNull()
    expect(screen.queryByText(/^tax$/i)).toBeNull()
    expect(screen.queryByText(/^shipping$/i)).toBeNull()
  })

  it('closes on Escape', () => {
    setup([line()])
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
