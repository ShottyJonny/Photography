import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CartProvider } from '@/components/cart/CartContext'
import Checkout from '@/app/(store)/checkout/page'

const SEED = [{ photoId: 'p1', slug: 's', title: 'A Photo', altText: 'a', size: '8x10', register: 'colour', qty: 2 }]

beforeEach(() => { localStorage.setItem('cart:v1', JSON.stringify(SEED)) })
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })

function fillValidAddress() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'buyer@example.com' } })
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Buyer' } })
  fireEvent.change(screen.getByLabelText('Street'), { target: { value: '1 Rd' } })
  fireEvent.change(screen.getByLabelText('City'), { target: { value: 'LA' } })
  fireEvent.change(screen.getByLabelText('State / Region'), { target: { value: 'CA' } })
  fireEvent.change(screen.getByLabelText('Postal code'), { target: { value: '90001' } })
}

describe('Checkout', () => {
  it('shows subtotal-only until the address is complete, then the full quote', async () => {
    render(<CartProvider><Checkout /></CartProvider>)
    await screen.findByText(/A Photo/)
    expect(screen.getByText(/calculated once your address is complete/i)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('State / Region'), { target: { value: 'CA' } })
    expect(screen.queryByText(/calculated once your address is complete/i)).toBeNull()
    expect(screen.getByText('Total')).toBeTruthy()
  })

  it('disables Pay until the form is valid and the cart is non-empty', async () => {
    render(<CartProvider><Checkout /></CartProvider>)
    await screen.findByText(/A Photo/)
    const pay = () => screen.getByRole('button', { name: /pay with stripe/i })
    expect(pay()).toHaveProperty('disabled', true)
    fillValidAddress()
    expect(pay()).toHaveProperty('disabled', false)
  })

  it('POSTs only {photoId,size,register,qty} per item — no slug/altText leak (F5)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({ error: 'stop' }) }))
    vi.stubGlobal('fetch', fetchMock)
    render(<CartProvider><Checkout /></CartProvider>)
    await screen.findByText(/A Photo/)
    fillValidAddress()
    fireEvent.click(screen.getByRole('button', { name: /pay with stripe/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const calls = fetchMock.mock.calls as unknown as [string, { body: string }][]
    const sent = JSON.parse(calls[0][1].body)
    expect(sent.items).toEqual([{ photoId: 'p1', size: '8x10', register: 'colour', qty: 2 }])
    expect(Object.keys(sent.items[0]).sort()).toEqual(['photoId', 'qty', 'register', 'size'])
  })

  it('offers only the United States as a shipping destination', () => {
    render(<CartProvider><Checkout /></CartProvider>)
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['United States'])
  })
})
