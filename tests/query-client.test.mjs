import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requestQuery } from '../src/ai/query-client.ts'
import { executeQueryPlan } from '../server/query-engine.ts'
import { loadSourceLeads } from '../server/source-leads.ts'
const plan = { status: 'query', reason: 'none', operation: 'count', measure: 'leads', filters: [], groupBy: 'none', sortBy: 'id', direction: 'asc', limit: 25 }
const result = executeQueryPlan(plan, loadSourceLeads(), 'My own question', 'gemini-3.5-flash-lite')
test('free-form question client sends only question to the same origin and accepts computed/limitation contracts', async () => {
  let calls = 0
  assert.deepEqual(await requestQuery(' My own question ', { fetchImpl: async (url, init) => {
    calls++
    assert.equal(url, '/api/ai/query')
    assert.deepEqual(JSON.parse(init.body), { question: 'My own question' })
    assert.deepEqual(init.headers, { 'Content-Type': 'application/json' })
    assert.equal(init.mode, 'same-origin')
    assert.equal(init.redirect, 'error')
    return Response.json(result)
  } }), result)
  assert.equal(calls, 1)
  for (const status of ['unsupported', 'clarify']) assert.equal((await requestQuery('My own question', { fetchImpl: async () => Response.json({ status, question: 'My own question', message: 'Please clarify.' }) })).status, status)
})
test('query client rejects bad responses, stale questions and network errors without raw messages or fallbacks', async () => {
  for (const value of [null, {}, { ...result, question: 'different' }, { ...result, records: [] }, { ...result, records: [{ company: {} }] }, { ...result, matchedLeadIds: ['L01', 'L01'] }, { ...result, value: -1 }]) await assert.rejects(requestQuery('My own question', { fetchImpl: async () => Response.json(value) }), /unusable response/)
  await assert.rejects(requestQuery('question', { fetchImpl: async () => { throw new Error('private info') } }), /could not reach/)
  await assert.rejects(requestQuery('question', { fetchImpl: async () => Response.json({ error: { code: 'INVALID_QUERY_PLAN', message: 'private info' } }, { status: 502 }) }), /safely validated/)
})
test('query client enforces input length and a single abortable deadline', async () => {
  for (const question of ['', ' ', 'x'.repeat(801)]) await assert.rejects(requestQuery(question, { fetchImpl: async () => assert.fail('No call expected') }), /800/)
  let calls = 0
  await assert.rejects(requestQuery('question', { timeoutMs: 10, fetchImpl: async (_, init) => {
    calls++
    return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('Timed out'))))
  } }), /timed out/)
  assert.equal(calls, 1)
})
