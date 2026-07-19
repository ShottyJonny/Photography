'use client'
import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useCart, lineKey } from '@/components/cart/CartContext'
import { Plate } from '@/components/store/Plate'
import { priceForSize } from '@/lib/format/price'

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`
}

export function CartDrawer() {
  const { lines, count, isOpen, close, remove, setQty } = useCart()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const opener = document.activeElement as HTMLElement | null // restore focus here on close (F6)
    closeRef.current?.focus()                                    // move focus INTO the dialog on open
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return }
      if (e.key !== 'Tab') return
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
      if (!nodes || nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
      opener?.focus?.() // return focus to the opener on close
    }
  }, [isOpen, close])

  if (!isOpen) return null

  const subtotal = lines.reduce((sum, l) => sum + priceForSize(l.size) * l.qty, 0)

  return (
    <div className="drawer-root">
      <div className="drawer-backdrop" onClick={close} aria-hidden="true" />
      <div className="drawer-panel" role="dialog" aria-modal="true" aria-label="Your selection" ref={panelRef}>
        <header className="drawer-head">
          <span className="drawer-title">Your selection · {count} {count === 1 ? 'work' : 'works'}</span>
          <button ref={closeRef} type="button" className="drawer-close" aria-label="Close" onClick={close}>✕</button>
        </header>

        {lines.length === 0 ? (
          <p className="drawer-empty">Your selection is empty.</p>
        ) : (
          <ul className="drawer-list">
            {lines.map((l) => {
              const key = lineKey(l)
              return (
                <li key={key} className="drawer-row">
                  <div className="drawer-thumb">
                    <Plate
                      photo={{ slug: l.slug, alt_text: l.altText, width_px: null, height_px: null, aspect_ratio: 0.8 }}
                      register={l.register}
                      sizes="76px"
                    />
                  </div>
                  <div className="drawer-meta">
                    <p className="drawer-row-title">{l.title}</p>
                    <p className="drawer-row-sub">{l.size} · {l.register}</p>
                    <div className="drawer-stepper" role="group" aria-label={`Quantity for ${l.title}, ${l.size}`}>
                      <button type="button" aria-label="Decrease quantity" onClick={() => setQty(key, l.qty - 1)}>−</button>
                      <span aria-live="polite">{l.qty}</span>
                      <button type="button" aria-label="Increase quantity" onClick={() => setQty(key, l.qty + 1)}>+</button>
                    </div>
                  </div>
                  <div className="drawer-line-right">
                    <span className="drawer-price">{formatPrice(priceForSize(l.size) * l.qty)}</span>
                    <button type="button" className="drawer-remove" onClick={() => remove(key)}>Remove</button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <footer className="drawer-foot">
          <div className="drawer-subtotal">
            <span>Subtotal</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          <p className="drawer-note">Shipping &amp; tax calculated at checkout.</p>
          <Link href="/checkout" className="drawer-checkout" onClick={close}>Review &amp; checkout →</Link>
        </footer>
      </div>
    </div>
  )
}
