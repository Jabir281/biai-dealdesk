import { loadEnv } from 'vite'
import type { Plugin } from 'vite'
import { createDraftHandler } from './draft.ts'
import { createQueryHandler } from './query.ts'
import { createLocalMiddleware } from './local-adapter.ts'
import { createReviewerHandlers } from './reviewer-auth.ts'

export function localDraftApi(): Plugin {
  return {
    name: 'local-draft-api',
    apply: 'serve',
    configureServer(server) {
      // Load only on the server; never define/import this value into client code.
      const env = loadEnv(server.config.mode, server.config.root, ['GEMINI_API_KEY', 'GEMINI_MODEL', 'BIAI_REVIEWER_PASSWORD', 'BIAI_SESSION_SECRET'])
      const auth = createReviewerHandlers({ reviewerPassword: env.BIAI_REVIEWER_PASSWORD, sessionSecret: env.BIAI_SESSION_SECRET, apiKey: env.GEMINI_API_KEY, local: true })
      server.middlewares.use(createLocalMiddleware(auth.login, '/api/auth/login'))
      server.middlewares.use(createLocalMiddleware(auth.status, '/api/auth/session'))
      server.middlewares.use(createLocalMiddleware(auth.logout, '/api/auth/logout'))
      const handler = createDraftHandler({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL, local: true })
      server.middlewares.use(createLocalMiddleware(handler))
      server.middlewares.use(createLocalMiddleware(createQueryHandler({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL, local: true }), '/api/ai/query'))
    },
  }
}
