export type SignInErrorKind = 'credentials' | 'rate_limited' | 'transport' | 'unknown'

export type SignInState =
  | { status: 'idle' }
  | { status: 'error'; kind: SignInErrorKind }
  | { status: 'fieldErrors'; email?: string; password?: string }

export const INITIAL_SIGN_IN_STATE: SignInState = { status: 'idle' }

// Typographic apostrophes per design.md §11.2.
export const SIGN_IN_ERROR_COPY: Record<SignInErrorKind, string> = {
  // Deliberately generic — never reveals whether an address exists. GoTrue
  // returns a uniform invalid_credentials for both cases, so this matches.
  credentials: 'Those credentials didn’t work.',
  rate_limited: 'Too many attempts. Wait a minute and try again.',
  // Says only what is known. "Couldn't reach the authentication service"
  // asserts a network fact the app cannot establish — a 500 was reached fine.
  transport: 'Sign-in isn’t working right now. Not your password.',
  unknown: 'Sign-in failed.',
}
