// Run the bulk import under: node --import ./scripts/neutralize-server-only.mjs --import tsx ...
// This --import comes BEFORE tsx so the server-only mapping is in the hook chain;
// tsx delegates the bare `server-only` specifier down to our resolver via next().
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./scripts/server-only-resolver.mjs', pathToFileURL('./').href)
