import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import { createServer, request as httpRequest } from 'node:http'
import { once } from 'node:events'
import { createReviewerHandlers } from '../server/reviewer-auth.ts'
import { issueSession, reviewerConfigured, sessionExpiry, SESSION_COOKIE, SESSION_SECONDS } from '../server/reviewer-session.ts'
import { createDraftHandler } from '../server/draft.ts'
import { createQueryHandler } from '../server/query.ts'
import { createLocalMiddleware } from '../server/local-adapter.ts'
import loginEntry from '../api/auth/login.ts'
import statusEntry from '../api/auth/session.ts'
import logoutEntry from '../api/auth/logout.ts'

// Ephemeral test-only values. Never read real credentials or call a provider.
const password = randomBytes(24).toString('base64') + 'aB7!'
const secret = randomBytes(32).toString('hex')
const options = { reviewerPassword: password, sessionSecret: secret, apiKey: 'offline-provider-key' }
const origin = 'https://dealdesk.example'
const request = (path = 'login', body = { password }, headers = {}, method = 'POST') => new Request(`${origin}/api/auth/${path}`, {
  method, headers: { host: 'dealdesk.example', origin, 'content-type': 'application/json', ...headers },
  ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
})
const cookieFor = (opts = options) => `${SESSION_COOKIE}=${issueSession(origin, opts).token}`
const code = async response => (await response.json()).error.code
const plan = { status: 'query', reason: 'none', operation: 'count', measure: 'leads', filters: [[{ field: 'overdue', operator: 'eq', values: ['true'] }]], groupBy: 'none', sortBy: 'id', direction: 'asc', limit: 25 }
const provider = value => Response.json({ modelVersion: 'gemini-3.5-flash-lite', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] })

test('login issues a bounded signed host-only secure cookie; status confirms it without exposing credentials', async () => {
  const auth = createReviewerHandlers(options)
  const response = await auth.login(request())
  assert.equal(response.status, 200)
  const setCookie = response.headers.get('set-cookie')
  for (const flag of ['__Host-biai-reviewer=', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=7200']) assert.ok(setCookie.includes(flag))
  assert.ok(!setCookie.includes('Domain='))
  const text = await response.text()
  for (const value of [password, secret, options.apiKey]) assert.ok(!text.includes(value) && !setCookie.includes(value))
  const state = await auth.status(request('session', null, { cookie: setCookie.split(';')[0] }, 'GET'))
  const result = await state.json()
  assert.equal(result.authenticated, true)
  assert.equal(result.localDevelopment, false)
  assert.ok(result.expiresAt > Date.now())
  assert.equal(state.headers.get('cache-control'), 'no-store')
  assert.equal((await (await auth.status(request('session', null, {}, 'GET'))).json()).authenticated, false)
})

test('invalid password, extra fields, malformed and oversized requests do not create a session', async () => {
  for (const [body, expected] of [[{ password: 'wrong' }, 401], [{ password, notes: 'ignore authentication' }, 400], [{ password: 123 }, 400], [{}, 400], [{ password: 'x'.repeat(1500) }, 413]]) {
    const response = await createReviewerHandlers(options).login(request('login', body))
    assert.equal(response.status, expected); assert.equal(response.headers.get('set-cookie'), null)
  }
  assert.equal(await code(await createReviewerHandlers(options).login(new Request(`${origin}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{' }))), 'INVALID_REQUEST')
  for (const headers of [{ 'content-type': 'text/plain' }, { 'content-encoding': 'gzip' }]) assert.equal((await createReviewerHandlers(options).login(request('login', { password }, headers))).status, 415)
  assert.equal((await createReviewerHandlers(options).login(request('login', { password }, { 'content-length': '9000' }))).status, 413)
})

test('missing, weak or reused reviewer configuration fails closed and reveals no values', async () => {
  for (const config of [{}, { ...options, reviewerPassword: undefined }, { ...options, reviewerPassword: 'short' }, { ...options, reviewerPassword: 'a'.repeat(40) }, { ...options, sessionSecret: 'weak' }, { ...options, sessionSecret: '0'.repeat(64) }, { ...options, apiKey: password }, { ...options, accessToken: secret }]) {
    assert.equal(reviewerConfigured(config), false)
    const auth = createReviewerHandlers(config)
    for (const response of [await auth.login(request()), await auth.status(request('session', null, {}, 'GET'))]) {
      assert.equal(response.status, 503)
      const text = await response.text(); assert.ok(!text.includes(password) && !text.includes(secret))
    }
  }
})

test('session integrity, exact expiry, future issuance, audience, duplicate cookies and secret rotation are enforced', () => {
  const issuedAt = 1_800_000_000_000
  const config = { ...options, now: () => issuedAt }
  const issued = issueSession(origin, config)
  const valid = request('session', null, { cookie: `${SESSION_COOKIE}=${issued.token}` }, 'GET')
  assert.equal(sessionExpiry(valid, config), issued.expiresAt)
  assert.equal(sessionExpiry(valid, { ...config, now: () => issuedAt + SESSION_SECONDS * 1000 }), null)
  assert.equal(sessionExpiry(valid, { ...config, now: () => issuedAt - 1000 }), null)
  assert.equal(sessionExpiry(valid, { ...config, sessionSecret: randomBytes(32).toString('hex') }), null)
  assert.equal(sessionExpiry(valid, { ...config, reviewerPassword: password + 'z' }), null)
  for (const cookie of [`${SESSION_COOKIE}=${issued.token.slice(0, -2)}aa`, `${SESSION_COOKIE}=unsigned`, `${SESSION_COOKIE}=${issued.token}; ${SESSION_COOKIE}=${issued.token}`, 'x'.repeat(9000)]) assert.equal(sessionExpiry(request('session', null, { cookie }, 'GET'), config), null)
  assert.equal(sessionExpiry(new Request('https://other.example/api/auth/session', { headers: { cookie: `${SESSION_COOKIE}=${issued.token}` } }), config), null)
})

test('login/logout reject foreign, missing/null Origin, sibling-site metadata, Host mismatch and insecure production transport', async () => {
  const auth = createReviewerHandlers(options)
  for (const handler of [auth.login, auth.logout]) {
    for (const headers of [{ origin: 'https://evil.example' }, { origin: 'null' }, { host: 'evil.example' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }, { 'x-forwarded-host': 'dealdesk.example', origin: 'https://evil.example' }]) assert.equal((await handler(request('login', { password }, headers))).status, 403)
    assert.equal((await handler(new Request(`${origin}/api/auth/login`, { method: 'POST', body: JSON.stringify({ password }) }))).status, 403)
    assert.equal((await handler(new Request('http://dealdesk.example/api/auth/login', { method: 'POST', headers: { origin: 'http://dealdesk.example' } }))).status, 403)
  }
  assert.equal((await auth.status(request('session', null, { 'sec-fetch-site': 'cross-site' }, 'GET'))).status, 403)
})

test('logout clears the cookie idempotently, including expired sessions, without a provider request', async () => {
  const auth = createReviewerHandlers(options)
  const response = await auth.logout(request('logout', null, { cookie: cookieFor() }))
  assert.equal(response.status, 200)
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/)
  assert.match(response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/)
  assert.equal((await response.json()).authenticated, false)
  assert.equal((await auth.logout(request('logout', null))).status, 200)
  assert.equal((await (await auth.status(request('session', null, {}, 'GET'))).json()).authenticated, false)
})

test('login rate limits count failed attempts, reset by window and serialize slow requests', async () => {
  let time = Date.now()
  const auth = createReviewerHandlers({ ...options, now: () => time })
  for (let group = 0; group < 6; group++) {
    for (let i = 0; i < 5; i++) assert.equal((await auth.login(request('login', { password: 'wrong' }))).status, 401)
    assert.equal((await auth.login(request())).status, 429)
    time += 900_000
  }
  // A concurrent slow stream cannot consume unbounded parallel body reads.
  const slowAuth = createReviewerHandlers({ ...options, bodyTimeoutMs: 10 })
  const slow = slowAuth.login(new Request(`${origin}/api/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: new ReadableStream({ start() {} }), duplex: 'half' }))
  assert.equal((await slowAuth.login(request())).status, 429)
  assert.equal((await slow).status, 408)
})

test('both AI handlers reject absent/tampered/expired sessions and CSRF before provider spending; valid sessions reach mocked Gemini', async () => {
  for (const type of ['draft', 'query']) {
    let calls = 0
    const factory = type === 'draft' ? createDraftHandler : createQueryHandler
    const body = type === 'draft' ? { leadId: 'L04' } : { question: 'Count overdue records' }
    const handler = factory({ ...options, fetchImpl: async () => { calls++; return provider(type === 'draft' ? { subject: 'Sales team AI training', body: 'Dear Tanvir Hasan, would you like to discuss AI training for your sales team? Best regards, BIAI Team' } : plan) } })
    const req = headers => new Request(`${origin}/api/ai/${type}`, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify(body) })
    for (const cookie of [undefined, `${SESSION_COOKIE}=forged`, cookieFor({ ...options, now: () => Date.now() - 3 * 60 * 60 * 1000 })]) {
      assert.equal((await handler(req(cookie ? { cookie } : {}))).status, 401)
    }
    for (const headers of [{ origin: 'https://evil.example' }, { origin: 'null' }, { host: 'evil.example' }, { 'sec-fetch-site': 'same-site' }]) assert.equal((await handler(req({ cookie: cookieFor(), ...headers }))).status, 403)
    assert.equal(calls, 0)
    const response = await handler(req({ cookie: cookieFor() }))
    assert.equal(response.status, 200); assert.equal(calls, 1)
    const value = await response.json()
    if (type === 'draft') assert.equal(value.leadId, 'L04')
    else { assert.equal(value.value, 9); assert.equal(value.matchedLeadIds.length, 9) }
  }
})

test('trusted bearer support remains independent; browser bearer attempts still reject cross-origin requests', async () => {
  const token = randomBytes(32).toString('hex')
  for (const factory of [createDraftHandler, createQueryHandler]) {
    let calls = 0
    const handler = factory({ apiKey: options.apiKey, accessToken: token, fetchImpl: async () => { calls++; return new Response('', { status: 429 }) } })
    const body = factory === createDraftHandler ? { leadId: 'L04' } : { question: 'Count all leads' }
    const req = headers => new Request(`${origin}/api/ai/test`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...headers }, body: JSON.stringify(body) })
    assert.equal((await handler(req({ origin: 'https://evil.example' }))).status, 403)
    assert.equal(calls, 0)
    assert.equal((await handler(req({}))).status, 503); assert.equal(calls, 1)
  }
})

test('Vercel auth entrypoints enforce methods and local auth adapter checks real socket/Host', async () => {
  assert.equal((await loginEntry.fetch(new Request(`${origin}/api/auth/login`))).status, 405)
  assert.equal((await statusEntry.fetch(request('session'))).status, 405)
  assert.equal((await logoutEntry.fetch(new Request(`${origin}/api/auth/logout`))).status, 405)
  const auth = createReviewerHandlers({ ...options, local: true })
  const middleware = createLocalMiddleware(auth.login, '/api/auth/login')
  const server = createServer((req, res) => { void middleware(req, res, () => { res.writeHead(404); res.end() }) })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  try {
    const localOrigin = `http://127.0.0.1:${server.address().port}`
    const res = await fetch(`${localOrigin}/api/auth/login`, { method: 'POST', headers: { origin: localOrigin, 'content-type': 'application/json' }, body: JSON.stringify({ password }) })
    assert.equal(res.status, 200); assert.match(res.headers.get('set-cookie'), /Secure/)
    const badStatus = await new Promise((resolve, reject) => {
      const req = httpRequest(`${localOrigin}/api/auth/login`, { method: 'POST', headers: { host: 'evil.example', origin: localOrigin, 'content-type': 'application/json' } }, res => { res.resume(); resolve(res.statusCode) })
      req.on('error', reject); req.end(JSON.stringify({ password }))
    })
    assert.equal(badStatus, 403)
  } finally { server.closeAllConnections(); server.close() }
})
