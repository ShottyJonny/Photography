import { pathToFileURL } from 'node:url'
import { resolve as resolvePath } from 'node:path'

const STUB = pathToFileURL(resolvePath('scripts/server-only-stub.mjs')).href

export async function resolve(specifier, context, next) {
  // Delegate everything else (including tsx's own resolution) down the chain.
  if (specifier === 'server-only') return { url: STUB, shortCircuit: true }
  return next(specifier, context)
}
