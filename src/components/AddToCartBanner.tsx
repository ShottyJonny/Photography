import React from 'react'

type CartAddDetail = { id: string; name?: string; qty: number; size?: string }

export default function AddToCartBanner(){
  const [msg, setMsg] = React.useState<string | null>(null)
  const hideRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    const onAdd = (e: Event) => {
      const detail = (e as CustomEvent<CartAddDetail>).detail
      const text = `${detail.name || 'Item'} added to cart${detail.size ? ` • ${detail.size}` : ''}${detail.qty > 1 ? ` ×${detail.qty}` : ''}.`
      setMsg(text)
      if (hideRef.current) window.clearTimeout(hideRef.current)
      hideRef.current = window.setTimeout(() => setMsg(null), 2400)
    }
    window.addEventListener('cart:add', onAdd as EventListener)
    return () => {
      window.removeEventListener('cart:add', onAdd as EventListener)
      if (hideRef.current) window.clearTimeout(hideRef.current)
    }
  }, [])

  if (!msg) return null
  return (
    <div className="atc-banners" role="status" aria-live="polite">
      <div className="atc-banner" onClick={() => setMsg(null)}>{msg}</div>
    </div>
  )
}
