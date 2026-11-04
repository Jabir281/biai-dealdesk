import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canDraftLocally, DraftRequestError, formatEmail, requestDraft } from '../src/ai/draft-client.ts'

const draft = {
  subject: 'Following up on sales team AI training',
  body: 'Dear Tanvir Hasan,\n\nWould you like to discuss AI training for the sales team at Karnaphuli Foods?\n\nBIAI Team',
  leadId: 'L04', sourceFields: ['company', 'contactName', 'contactRole', 'stage', 'notes'],
  model: 'gemini-3.5-flash-lite', draftOnly: true,
}

test('browser request sends only the selected lead ID to the same-origin endpoint without credentials in headers', async () => {
  const calls = []
  const result = await requestDraft('L04', { fetchImpl: async (...args) => { calls.push(args); return Response.json(draft) } })
  assert.deepEqual(result, draft)
  assert.equal(calls.length, 1)
  const [url, init] = calls[0]
  assert.equal(url, '/api/ai/draft')
  assert.equal(init.method, 'POST')
  assert.deepEqual(JSON.parse(init.body), { leadId: 'L04' })
  assert.deepEqual(init.headers, { 'Content-Type': 'application/json' })
  assert.equal(init.mode, 'same-origin')
  assert.equal(init.credentials, 'same-origin')
  assert.equal(init.redirect, 'error')
})

test('all 25 source IDs can be requested independently, retaining duplicates', async () => {
  const seen = []
  for (let number = 1; number <= 25; number++) {
    const leadId = `L${String(number).padStart(2, '0')}`
    const result = await requestDraft(leadId, { fetchImpl: async (_, init) => {
      seen.push(JSON.parse(init.body).leadId)
      return Response.json({ ...draft, leadId })
    } })
    assert.equal(result.leadId, leadId)
  }
  assert.equal(new Set(seen).size, 25)
  for (const id of ['L01', 'L23', 'L02', 'L03']) assert.ok(seen.includes(id))
})

test('provider, configuration, authorization, quota and timeout failures have safe actionable messages with no retry', async () => {
  const cases = {
    MODEL_UNAVAILABLE: /model is unavailable/, PROVIDER_FAILURE: /could not complete/,
    PROVIDER_REQUEST_REJECTED: /configuration/, PROVIDER_TIMEOUT: /timed out/,
    REQUEST_TIMEOUT: /timed out/, RATE_LIMITED: /Wait/,
    PROVIDER_QUOTA_EXCEEDED: /quota/, AI_NOT_CONFIGURED: /not configured/,
    MODEL_NOT_CONFIGURED: /not configured/, ACCESS_NOT_CONFIGURED: /Secure browser access/,
    UNAUTHORIZED: /does not authorize/, LOCAL_ACCESS_ONLY: /local development/,
    PROVIDER_ACCESS_DENIED: /denied access/, LEAD_NOT_FOUND: /could not be found/,
    SOURCE_UNAVAILABLE: /source leads/, SOURCE_TOO_LARGE: /limit/,
    INVALID_REQUEST: /not accepted/, INVALID_PROVIDER_RESPONSE: /No usable draft/,
  }
  for (const [code, message] of Object.entries(cases)) {
    let calls = 0
    await assert.rejects(requestDraft('L04', { fetchImpl: async () => {
      calls++
      return Response.json({ error: { code, message: 'Untrusted message with private details' } }, { status: 503 })
    } }), (error) => error instanceof DraftRequestError && error.code === code && message.test(error.message) && !error.message.includes('private'))
    assert.equal(calls, 1)
  }
})

test('malformed and wrong-lead success responses are never accepted as a draft', async () => {
  for (const value of [null, [], {}, { ...draft, leadId: 'L23' }, { ...draft, draftOnly: false },
    { ...draft, subject: '' }, { ...draft, subject: 'a'.repeat(121) }, { ...draft, subject: 'Line\nbreak' },
    { ...draft, body: '' }, { ...draft, body: 'x'.repeat(1801) }, { ...draft, model: 'untrusted model' },
    { ...draft, sourceFields: [] }, { ...draft, sourceFields: ['notes', 'secret'] },
    { ...draft, sourceFields: ['notes', 'notes'] }, { ...draft, sourceFields: ['toString'] }]) {
    await assert.rejects(requestDraft('L04', { fetchImpl: async () => Response.json(value) }), { code: 'INVALID_PROVIDER_RESPONSE' })
  }
  await assert.rejects(requestDraft('L04', { fetchImpl: async () => new Response('<html>Unavailable</html>') }), { code: 'INVALID_PROVIDER_RESPONSE' })
})

test('network and unknown errors reveal no raw exception or provider message', async () => {
  assert.equal(new DraftRequestError('toString').code, 'UNKNOWN_ERROR')
  assert.match(new DraftRequestError('toString').message, /could not be completed/)
  await assert.rejects(requestDraft('L04', { fetchImpl: async () => { throw new Error('private-value') } }), { code: 'NETWORK_ERROR' })
  await assert.rejects(requestDraft('L04', { fetchImpl: async () => Response.json({ error: { code: 'private-value', message: 'private-value' } }, { status: 502 }) }),
    error => error.code === 'UNKNOWN_ERROR' && !error.message.includes('private-value'))
  await assert.rejects(requestDraft('L04', { fetchImpl: async () => new Response('private-value', { status: 502 }) }), { code: 'PROVIDER_FAILURE' })
})

test('client timeout and cancellation abort the single pending request', async () => {
  let calls = 0
  const fetchImpl = async (_, init) => {
    calls++
    return new Promise((_, reject) => {
      if (init.signal.aborted) reject(new Error('Aborted'))
      else init.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })
    })
  }
  await assert.rejects(requestDraft('L04', { fetchImpl, timeoutMs: 10 }), { code: 'PROVIDER_TIMEOUT' })
  const controller = new AbortController()
  const cancelled = requestDraft('L04', { fetchImpl, signal: controller.signal })
  controller.abort()
  await assert.rejects(cancelled, { code: 'REQUEST_TIMEOUT' })
  assert.equal(calls, 2)
})

test('invalid IDs are rejected without an HTTP request; browser availability excludes production and remote hosts', async () => {
  for (const id of ['', 'L4', 'L04/../', 'L04?token=x']) {
    await assert.rejects(requestDraft(id, { fetchImpl: async () => assert.fail('No HTTP call permitted') }), { code: 'INVALID_REQUEST' })
  }
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    assert.equal(canDraftLocally(true, host), true)
    assert.equal(canDraftLocally(false, host), false)
  }
  for (const host of ['example.com', 'localhost.example.com', '192.168.1.4']) assert.equal(canDraftLocally(true, host), false)
})

test('copy-email content preserves edited text and paragraph breaks', () => {
  assert.equal(formatEmail({ subject: 'Edited subject', body: 'First paragraph.\n\nSecond paragraph.' }), 'Subject: Edited subject\n\nFirst paragraph.\n\nSecond paragraph.')
})
