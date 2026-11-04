import { loadEnvFile } from 'node:process'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createDraftHandler, resolveModel } from '../server/draft.ts'
import { createLocalMiddleware } from '../server/local-adapter.ts'

// Explicit opt-in only; never imported by tests, build, dev startup or CI.
if (process.argv[2] !== '--live-once') {
  console.error('Use --live-once to explicitly authorize one L04 Gemini request. This may consume provider quota.')
  process.exitCode = 1
} else {
  try { loadEnvFile('.env.local') } catch { /* A production-style server environment is also supported. */ }
  if (!process.env.GEMINI_API_KEY?.trim()) {
    console.error('Live smoke test not attempted: GEMINI_API_KEY is missing.')
    process.exitCode = 1
  } else if (!resolveModel(process.env.GEMINI_MODEL)) {
    console.error('Live smoke test not attempted: unsupported server GEMINI_MODEL setting.')
    process.exitCode = 1
  } else {
    const model = resolveModel(process.env.GEMINI_MODEL)
    const handler = createDraftHandler({ apiKey: process.env.GEMINI_API_KEY, model, local: true })
    const middleware = createLocalMiddleware(handler)
    const server = createServer((req, res) => { void middleware(req, res, () => { res.writeHead(404); res.end() }) })
    try {
      server.listen(0, '127.0.0.1')
      await once(server, 'listening')
      console.log(`Explicit live smoke test: one POST for L04; model ${model}. No retries.`)
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ai/draft`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"leadId":"L04"}',
        signal: AbortSignal.timeout(25000),
      })
      const result = await response.json()
      // The handler returns only validated draft fields or allowlisted safe errors.
      console.log(JSON.stringify({ status: response.status, result }, null, 2))
      if (!response.ok) process.exitCode = 1
    } catch {
      console.error('Live smoke test failed at the local transport. No retry was made; provider completion is unknown.')
      process.exitCode = 1
    } finally { server.closeAllConnections(); server.close() }
  }
}
