// @ts-check
import js from '@eslint/js'
import globals from 'globals'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: globals.browser
    },
    plugins: {
      '@typescript-eslint': tseslint,
      react: reactPlugin,
      'react-hooks': reactHooks
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      // TypeScript-only identifiers (e.g. `as EventListener` referencing the
      // lib.dom.d.ts callback type) are not runtime globals, so the base JS
      // no-undef rule misreads them as undefined. tsc (gated separately via
      // `tsc --noEmit`) already checks name resolution correctly, including
      // type positions. This mirrors @typescript-eslint/eslint-plugin's own
      // bundled `eslint-recommended` config, which sets the same override.
      'no-undef': 'off',
      // Same rationale for no-unused-vars: the base rule flags parameter
      // names inside type-only function signatures (e.g. `(id: string) =>
      // void` in an interface) as unused locals, which they aren't - they're
      // documentation, never bound at runtime. Swap in the TypeScript-aware
      // version, which understands type-space and is @typescript-eslint's
      // own recommended pairing for this rule.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    },
    settings: {
      react: {
        version: 'detect'
      }
    }
  }
]
