import React from 'react'
import { useConsent } from '../context/ConsentContext'

export default function CookieBanner() {
  const { consent, setConsent, update } = useConsent()
  const [open, setOpen] = React.useState(() => !consent)

  React.useEffect(() => { setOpen(!consent) }, [consent])

  if (!open) return null

  const acceptAll = () => setConsent({ analytics: true, marketing: true, necessary: true })
  const saveChoices = () => setOpen(false)

  return (
    <div className="cookie-banner" role="dialog" aria-live="polite" aria-label="Cookie consent">
      <div className="cookie-text">
        We use essential cookies to make this site work. With your consent, we also use cookies for analytics and marketing.
      </div>
      <div className="cookie-actions">
        <label className="check small">
          <input type="checkbox" checked readOnly />
          <span>Essential</span>
        </label>
        <label className="check small">
          <input type="checkbox" checked={!!consent?.analytics} onChange={e => update({ analytics: e.currentTarget.checked })} />
          <span>Analytics</span>
        </label>
        <label className="check small">
          <input type="checkbox" checked={!!consent?.marketing} onChange={e => update({ marketing: e.currentTarget.checked })} />
          <span>Marketing</span>
        </label>
        <div className="cookie-buttons">
          <button className="button" onClick={acceptAll}>Accept all</button>
          <button className="button" onClick={saveChoices}>Save choices</button>
        </div>
      </div>
    </div>
  )
}
