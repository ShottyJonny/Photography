import React from 'react'

export function navigate(to: string) {
  if (!to.startsWith('/')) to = '/' + to.replace(/^#\/?/, '')
  window.location.hash = to
}

type Props = React.PropsWithChildren<{
  to: string
  className?: string
  title?: string
}>

export default function LinkButton({ to, className, title, children }: Props) {
  const onClick = React.useCallback(() => navigate(to), [to])
  const onKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      navigate(to)
    }
  }, [to])
  return (
    <button type="button" className={className} onClick={onClick} onKeyDown={onKeyDown} title={title}>
      {children}
    </button>
  )
}
