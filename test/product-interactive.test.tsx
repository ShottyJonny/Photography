import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { CartProvider, useCart } from '@/components/cart/CartContext'
import { ProductInteractive } from '@/components/product/ProductInteractive'
import type { Photo } from '@/lib/data/photos'

const photoWithBw: Photo = {
  id: 'photo-1',
  slug: 'test-photo',
  title: 'Test Photo',
  caption: null,
  description: null,
  alt_text: 'A test photograph',
  aspect_ratio: 0.8,
  width_px: 1200,
  height_px: 1500,
  has_bw_variant: true,
}

const photoNoBw: Photo = {
  ...photoWithBw,
  id: 'photo-2',
  slug: 'colour-only',
  has_bw_variant: false,
}

function CartConsumer() {
  const { lines } = useCart()
  return <pre data-testid="cart">{JSON.stringify(lines)}</pre>
}

function renderWithCart(photo: Photo) {
  return render(
    <CartProvider>
      <ProductInteractive photo={photo} />
      <CartConsumer />
    </CartProvider>,
  )
}

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
})

afterEach(() => {
  cleanup()
})

describe('ProductInteractive', () => {
  it('updates price when size changes', () => {
    renderWithCart(photoWithBw)
    expect(screen.getByText('$15')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '20x30' }))
    expect(screen.getByText('$65')).toBeTruthy()
  })

  it('swaps plate AVIF source srcSet when register changes', () => {
    const { container } = renderWithCart(photoWithBw)
    const avifSource = () => container.querySelector('source[type="image/avif"]')
    expect(avifSource()!.getAttribute('srcSet')).toContain('/colour/')
    fireEvent.click(screen.getByRole('button', { name: 'Silver' }))
    expect(avifSource()!.getAttribute('srcSet')).toContain('/silver/')
  })

  it('adds lines to cart with current size and register', () => {
    renderWithCart(photoWithBw)
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }))
    const cart = JSON.parse(screen.getByTestId('cart').textContent!)
    expect(cart).toHaveLength(1)
    expect(cart[0]).toMatchObject({
      photoId: 'photo-1',
      size: '8x10',
      register: 'colour',
      qty: 1,
    })

    fireEvent.click(screen.getByRole('button', { name: '4x6' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }))
    const cart2 = JSON.parse(screen.getByTestId('cart').textContent!)
    expect(cart2).toHaveLength(2)
    expect(cart2[1]).toMatchObject({
      photoId: 'photo-1',
      size: '4x6',
      register: 'colour',
      qty: 1,
    })
  })

  it('disables Silver when has_bw_variant is false', () => {
    renderWithCart(photoNoBw)
    expect(screen.getByRole('button', { name: 'Silver' })).toHaveProperty('disabled', true)
  })

  it('does not render Save to collection', () => {
    renderWithCart(photoWithBw)
    expect(screen.queryByText(/save to collection/i)).toBeNull()
  })

  it('shows crop caption with label that updates with size', () => {
    renderWithCart(photoWithBw)
    expect(screen.getByText(/Guides show the 8×10 crop/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '4x6' }))
    expect(screen.getByText(/Guides show the 4×6 crop/)).toBeTruthy()
  })

  it('includes slug and altText snapshot in the added line', () => {
    renderWithCart(photoWithBw)
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }))
    const cart = JSON.parse(screen.getByTestId('cart').textContent!)
    expect(cart[0]).toMatchObject({ slug: 'test-photo', altText: 'A test photograph' })
  })

  it('announces an Added confirmation after adding', () => {
    renderWithCart(photoWithBw)
    expect(screen.queryByText(/added to your selection/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }))
    expect(screen.getByText(/added to your selection/i)).toBeTruthy()
  })
})
