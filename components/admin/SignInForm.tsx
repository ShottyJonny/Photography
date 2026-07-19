'use client'

import { useActionState } from 'react'
import { signIn } from '@/lib/admin/auth-actions'
import { INITIAL_SIGN_IN_STATE, SIGN_IN_ERROR_COPY, type SignInState } from '@/lib/admin/auth-state'

/**
 * Presentational only, so every state is testable without driving a real
 * Server Action through useActionState.
 */
export function SignInFields({ state, pending }: { state: SignInState; pending: boolean }) {
  const fieldErrors = state.status === 'fieldErrors' ? state : null

  return (
    <>
      <label className="admin-field" htmlFor="email">
        <span>Email</span>
        <input
          id="email" name="email" type="email" autoComplete="email" required
          aria-invalid={fieldErrors?.email ? true : undefined}
          aria-describedby={fieldErrors?.email ? 'email-error' : undefined}
        />
      </label>
      {fieldErrors?.email ? (
        <p className="admin-field-error" id="email-error">{fieldErrors.email}</p>
      ) : null}

      <label className="admin-field" htmlFor="password">
        <span>Password</span>
        <input
          id="password" name="password" type="password" autoComplete="current-password" required
          aria-invalid={fieldErrors?.password ? true : undefined}
          aria-describedby={fieldErrors?.password ? 'password-error' : undefined}
        />
      </label>
      {fieldErrors?.password ? (
        <p className="admin-field-error" id="password-error">{fieldErrors.password}</p>
      ) : null}

      {/* Rendered unconditionally: a live region must already exist in the DOM
          for its later content to be announced. */}
      <p className="admin-alert" role="alert">
        {state.status === 'error' ? SIGN_IN_ERROR_COPY[state.kind] : null}
      </p>

      <button type="submit" className="admin-btn" disabled={pending}>
        Sign in
      </button>
    </>
  )
}

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signIn, INITIAL_SIGN_IN_STATE)
  return (
    <form action={formAction} className="admin-signin-form">
      <SignInFields state={state} pending={pending} />
    </form>
  )
}
