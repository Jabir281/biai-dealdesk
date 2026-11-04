// Isolated HTTPS verification server: production auth, real cookies, mocked Gemini only.
// Never loads .env files. Never imports production entrypoints with environment credentials.
import { createServer } from 'node:https'
import { Readable } from 'node:stream'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createReviewerHandlers } from '../../server/reviewer-auth.ts'
import { createDraftHandler } from '../../server/draft.ts'
import { createQueryHandler } from '../../server/query.ts'

const directory = 'node_modules/.cache/biai-reviewer'
mkdirSync(directory, { recursive: true })
mkdirSync('artifacts/task-008', { recursive: true })
const certificate = spawnSync('C:/Program Files/Git/usr/bin/openssl.exe', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${directory}/test-key.pem`, '-out', `${directory}/test-cert.pem`, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore', windowsHide: true })
if (certificate.status !== 0) throw new Error('Could not create the isolated local test certificate.')
const testPassword = randomBytes(24).toString('base64') + 'aB7!'
const options = { reviewerPassword: testPassword, sessionSecret: randomBytes(32).toString('hex'), apiKey: 'offline-browser-test-key' }
writeFileSync(`${directory}/browser-run.js`, readFileSync('tests/browser/reviewer.playwright.js', 'utf8').replace('/* TEST_PASSWORD */ null', JSON.stringify(testPassword)))
const auth = createReviewerHandlers(options)
const counts = { draft: 0, query: 0, liveProviderRequests: 0 }
const reply = value => Response.json({ modelVersion: 'gemini-3.5-flash-lite', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] })
const draft = createDraftHandler({ ...options, fetchImpl: async () => {
  counts.draft++; await new Promise(resolve => setTimeout(resolve, 350))
  return reply({ subject: 'Offline test: sales team AI training', body: 'Dear Tanvir Hasan,\n\nWould you still like to discuss AI training for your sales team at Karnaphuli Foods?\n\nBest regards,\nBIAI Team' })
} })
const query = createQueryHandler({ ...options, fetchImpl: async () => {
  counts.query++; await new Promise(resolve => setTimeout(resolve, 350))
  return reply({ status: 'query', reason: 'none', operation: 'count', measure: 'leads', filters: [[{ field: 'overdue', operator: 'eq', values: ['true'] }]], groupBy: 'none', sortBy: 'id', direction: 'asc', limit: 25 })
} })
const routes = { '/api/auth/login': auth.login, '/api/auth/session': auth.status, '/api/auth/logout': auth.logout, '/api/ai/draft': draft, '/api/ai/query': query }
const files = new Set(readdirSync('dist', { recursive: true }).map(path => '/' + path.replaceAll('\\', '/')))
const server = createServer({ key: readFileSync(`${directory}/test-key.pem`), cert: readFileSync(`${directory}/test-cert.pem`) }, async (req, res) => {
  try {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || !['localhost:5180', '127.0.0.1:5180'].includes(req.headers.host)) { res.writeHead(403); res.end(); return }
    const url = new URL(req.url, `https://${req.headers.host}`)
    if (url.pathname === '/__test/metrics') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(counts)); return }
    const handler = routes[url.pathname]
    if (handler) {
      const headers = new Headers()
      for (let i = 0; i < req.rawHeaders.length; i += 2) headers.append(req.rawHeaders[i], req.rawHeaders[i + 1])
      const response = await handler(new Request(url, { method: req.method, headers, ...(req.method === 'GET' ? {} : { body: Readable.toWeb(req), duplex: 'half' }) }))
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text()); return
    }
    if (req.method !== 'GET' || (url.pathname !== '/' && !files.has(url.pathname))) { res.writeHead(404); res.end(); return }
    const path = url.pathname === '/' ? '/index.html' : url.pathname
    res.writeHead(200, { 'content-type': path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.svg') ? 'image/svg+xml' : 'text/html', 'cache-control': 'no-store' })
    res.end(readFileSync(`dist${path}`))
  } catch { res.writeHead(500); res.end('Isolated test server error.') }
})
server.listen(5180, '127.0.0.1', () => console.log('Isolated HTTPS auth test server ready at https://localhost:5180. Gemini is mocked; no real credentials loaded.'))
