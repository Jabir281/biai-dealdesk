import { loadEnv } from 'vite'
import type { Plugin } from 'vite'
import { createDraftHandler } from './draft.ts'
import { createLocalMiddleware } from './local-adapter.ts'

export function localDraftApi(): Plugin {
  return {
    name: 'local-draft-api',
    apply: 'serve',
    configureServer(server) {
      // Load only on the server; never define/import this value into client code.
      const env = loadEnv(server.config.mode, server.config.root, ['GEMINI_API_KEY', 'GEMINI_MODEL'])
      const handler = createDraftHandler({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL, local: true })
      server.middlewares.use(createLocalMiddleware(handler))
    },
  }
}
