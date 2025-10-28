import React from 'react'

export type DropdownOption = { value: string; label?: string }

type Props = {
  id?: string
  value: string
  onChange: (value: string) => void
  options: DropdownOption[] | readonly string[]
  className?: string
  label?: string
}

export default function Dropdown({ id, value, onChange, options, className, label }: Props) {
  const [open, setOpen] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(() => idxOfValue(options, value) ?? 0)
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const btnId = id || React.useId()

  const opts: DropdownOption[] = React.useMemo(() =>
    Array.isArray(options)
      ? (options as any[]).map((o) => typeof o === 'string' ? ({ value: o, label: o }) : o)
      : [], [options])

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  React.useEffect(() => {
    const idx = idxOfValue(opts, value)
    if (idx != null) setActiveIndex(idx)
  }, [value, opts])

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); setOpen(true); return
    }
    if (open) {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, opts.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(opts[activeIndex]); return }
    }
  }

  const commit = (opt: DropdownOption) => {
    onChange(opt.value)
    setOpen(false)
  }

  const labelText = label || 'Select'

  return (
    <div ref={wrapRef} className={`dropdown ${open ? 'open' : ''} ${className || ''}`.trim()} data-open={open}>
      <button
        id={btnId}
        type="button"
        className="dropdown-trigger button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={labelText}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
      >
        <span className="dropdown-label">{opts.find(o => o.value === value)?.label ?? value}</span>
        <span className="dropdown-caret" aria-hidden>▾</span>
      </button>
      <ul role="listbox" aria-labelledby={btnId} className="dropdown-menu">
        {opts.map((opt, i) => (
          <li key={opt.value} role="option" aria-selected={opt.value === value}>
            <button
              type="button"
              className={`dropdown-option${i === activeIndex ? ' active' : ''}${opt.value === value ? ' selected' : ''}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => commit(opt)}
            >
              {opt.label ?? opt.value}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function idxOfValue(list: DropdownOption[] | readonly string[], v: string) {
  const arr: DropdownOption[] = (list as any[]).map((o) => typeof o === 'string' ? ({ value: o, label: o }) : o)
  const i = arr.findIndex(o => o.value === v)
  return i >= 0 ? i : undefined
}
