// Child process for check-server-imports.mjs. No .env loading; network fetch is replaced before import.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const entry = process.argv[2]
assert.ok(/^api\/(auth\/(login|session|logout)|ai\/(draft|query))\.js$/.test(entry ?? ''))
const origin = 'https://packaging-check.example'
const password = randomBytes(24).toString('base64') + 'aB7!'
const secret = randomBytes(32).toString('hex')
process.env.BIAI_REVIEWER_PASSWORD = password
process.env.BIAI_SESSION_SECRET = secret
process.env.GEMINI_API_KEY = 'offline-packaging-test-only'
process.env.AI_DRAFT_ACCESS_TOKEN = randomBytes(32).toString('hex')
let calls = 0
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent')
  assert.equal(options.method, 'POST')
  calls++
  const value = entry.endsWith('query.js') ? {
    status: 'query', reason: 'none', operation: 'count', measure: 'leads',
    filters: [[{ field: 'overdue', operator: 'eq', values: ['true'] }]], groupBy: 'none', sortBy: 'id', direction: 'asc', limit: 25,
  } : { subject: 'Sales team AI training', body: 'Dear Tanvir Hasan, would you like to discuss AI training for your sales team at Karnaphuli Foods? Best regards, BIAI Team' }
  return Response.json({ modelVersion: 'gemini-3.5-flash-lite', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] })
}
const handler = (await import(pathToFileURL(resolve(entry)).href)).default.fetch
assert.equal(typeof handler, 'function')
const { issueSession, SESSION_COOKIE } = await import(pathToFileURL(resolve('server/reviewer-session.js')).href)
const cookie = `${SESSION_COOKIE}=${issueSession(origin, { reviewerPassword: password, sessionSecret: secret }).token}`
const request = (method, body, headers = {}) => new Request(`${origin}/${entry.slice(0, -3)}`, {
  method, headers: { origin, host: 'packaging-check.example', 'content-type': 'application/json', ...headers },
  ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
})
if (entry.endsWith('/login.js')) {
  assert.equal((await handler(request('POST', { password: 'wrong' }))).status, 401)
  const response = await handler(request('POST', { password }))
  assert.equal(response.status, 200)
  assert.match(response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/)
  assert.equal((await handler(request('POST', { password }, { origin: 'https://foreign.example' }))).status, 403)
} else if (entry.endsWith('/session.js')) {
  const anonymous = await handler(request('GET'))
  assert.equal(anonymous.status, 200); assert.equal((await anonymous.json()).authenticated, false)
  const authenticated = await handler(request('GET', undefined, { cookie }))
  assert.equal(authenticated.status, 200); assert.equal((await authenticated.json()).authenticated, true)
  assert.equal((await (await handler(request('GET', undefined, { cookie: `${SESSION_COOKIE}=tampered` }))).json()).authenticated, false)
} else if (entry.endsWith('/logout.js')) {
  const response = await handler(request('POST', {}, { cookie }))
  assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie'), /Max-Age=0/)
  assert.equal((await handler(request('POST', {}, { cookie, origin: 'https://foreign.example' }))).status, 403)
} else {
  const query = entry.endsWith('/query.js')
  const body = query ? { question: 'Count records overdue at the reference date' } : { leadId: 'L04' }
  assert.equal((await handler(request('POST', body))).status, 401)
  assert.equal((await handler(request('POST', body, { cookie, origin: 'https://foreign.example' }))).status, 403)
  assert.equal(calls, 0)
  const response = await handler(request('POST', body, { cookie }))
  assert.equal(response.status, 200)
  const result = await response.json()
  if (query) {
    assert.equal(result.value, 9)
    assert.deepEqual(result.matchedLeadIds, ['L04', 'L06', 'L10', 'L13', 'L15', 'L19', 'L20', 'L22', 'L25'])
  } else { assert.equal(result.leadId, 'L04'); assert.ok(result.sourceFields.includes('notes')) }
  assert.equal(calls, 1)
}
console.log(JSON.stringify({ verified: true, mockedProviderCalls: calls }))
