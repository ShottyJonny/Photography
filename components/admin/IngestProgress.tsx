'use client'

export type StepKey = 'upload' | 'colour' | 'silver' | 'finish'
export type StepState = 'pending' | 'active' | 'done' | 'failed'

export const STEP_LABELS: Record<StepKey, string> = {
  upload: 'Uploading the original',
  colour: 'Generating the colour sizes',
  silver: 'Generating the silver sizes',
  finish: 'Checking every size exists',
}

/**
 * product.md §1. A bare spinner claims nothing while thirty seconds pass, and a
 * premature "Saved" is the Order.tsx 900ms-setTimeout defect wearing new
 * clothes. Each step names what is actually happening, and a failure says which
 * step failed rather than reporting success for a photograph that is not there.
 */
export function IngestProgress({
  steps,
  message,
  failed,
}: {
  steps: { key: StepKey; state: StepState }[]
  message: string | null
  failed: boolean
}) {
  return (
    <div className="admin-progress" role="status" aria-live="polite">
      <ul className="admin-progress-steps">
        {steps.map(({ key, state }) => (
          <li key={key} className={`admin-progress-step is-${state}`}>
            <span aria-hidden="true">
              {state === 'done' ? '✓' : state === 'failed' ? '✕' : state === 'active' ? '…' : '·'}
            </span>
            {STEP_LABELS[key]}
          </li>
        ))}
      </ul>
      {message ? (
        <p className={`admin-progress-message${failed ? ' is-failed' : ''}`}>{message}</p>
      ) : null}
    </div>
  )
}
