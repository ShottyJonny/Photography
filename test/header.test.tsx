import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CartProvider, useCart } from '@/components/cart/CartContext'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { Header } from '@/components/store/Header'

function DrawerProbe() {
  const { isOpen } = useCart()
  return <span data-testid="open">{isOpen ? 'yes' : 'no'}</span>
}
function Seeder() {
  const { add } = useCart()
  return (
    <button onClick={() => add({ photoId: 'p1', slug: 's', title: 't', altText: 'a', size: '8x10', register: 'colour', qty: 3 })}>
      seed
    </button>
  )
}

afterEach(() => { cleanup(); localStorage.clear() })

function setup() {
  return render(
    <ThemeProvider>
      <CartProvider>
        <Header />
        <Seeder />
        <DrawerProbe />
      </CartProvider>
    </ThemeProvider>,
  )
}

describe('Header', () => {
  it('shows the cart count as the sum of quantities', () => {
    setup()
    expect(screen.getByRole('button', { name: /Cart \(0\)/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'seed' }))
    expect(screen.getByRole('button', { name: /Cart \(3\)/ })).toBeTruthy()
  })

  it('opens the drawer when the cart button is clicked', () => {
    setup()
    expect(screen.getByTestId('open').textContent).toBe('no')
    fireEvent.click(screen.getByRole('button', { name: /Cart \(0\)/ }))
    expect(screen.getByTestId('open').textContent).toBe('yes')
  })
})
