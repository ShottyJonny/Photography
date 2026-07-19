'use client'

export function CropGuide({
  insetPct,
  label,
}: {
  insetPct: { top: number; bottom: number; left: number; right: number }
  label: string
}) {
  const { top, bottom, left, right } = insetPct
  const hasCrop = top > 0 || bottom > 0 || left > 0 || right > 0

  return (
    <>
      {hasCrop && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
          }}
        >
          {top > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: `${top}%`,
                background: 'rgba(0, 0, 0, 0.35)',
              }}
            />
          )}
          {bottom > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: `${bottom}%`,
                background: 'rgba(0, 0, 0, 0.35)',
              }}
            />
          )}
          {left > 0 && (
            <div
              style={{
                position: 'absolute',
                top: `${top}%`,
                bottom: `${bottom}%`,
                left: 0,
                width: `${left}%`,
                background: 'rgba(0, 0, 0, 0.35)',
              }}
            />
          )}
          {right > 0 && (
            <div
              style={{
                position: 'absolute',
                top: `${top}%`,
                bottom: `${bottom}%`,
                right: 0,
                width: `${right}%`,
                background: 'rgba(0, 0, 0, 0.35)',
              }}
            />
          )}
          {top > 0 && (
            <div
              style={{
                position: 'absolute',
                top: `${top}%`,
                left: 0,
                right: 0,
                height: 1,
                background: 'var(--ink)',
                opacity: 0.6,
              }}
            />
          )}
          {bottom > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: `${bottom}%`,
                left: 0,
                right: 0,
                height: 1,
                background: 'var(--ink)',
                opacity: 0.6,
              }}
            />
          )}
          {left > 0 && (
            <div
              style={{
                position: 'absolute',
                top: `${top}%`,
                bottom: `${bottom}%`,
                left: `${left}%`,
                width: 1,
                background: 'var(--ink)',
                opacity: 0.6,
              }}
            />
          )}
          {right > 0 && (
            <div
              style={{
                position: 'absolute',
                top: `${top}%`,
                bottom: `${bottom}%`,
                right: `${right}%`,
                width: 1,
                background: 'var(--ink)',
                opacity: 0.6,
              }}
            />
          )}
        </div>
      )}
      <p className="crop-caption">Guides show the {label} crop</p>
      <style>{`
        .crop-caption {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--dim);
          margin: 0.5rem 0 0;
        }
      `}</style>
    </>
  )
}
