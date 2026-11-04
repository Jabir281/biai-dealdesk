import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sessionRequest } from '../src/auth/session-client.ts'

test('session client uses same-origin HttpOnly-cookie requests and never places credentials in URLs or headers', async () => {
  const loggedOut = { authenticated: false, localDevelopment: false, expiresAt: null }
  const loggedIn = { authenticated: true, localDevelopment: false, expiresAt: Date.now() + 60_000 }
  for (const action of ['session', 'login', 'logout']) {
    const response = await sessionRequest(action, 'fake-test-input', async (url, options) => {
      assert.equal(url, `/api/auth/${action}`)
      assert.equal(options.credentials, 'same-origin')
      assert.equal(options.redirect, 'error')
      assert.equal(options.cache, 'no-store')
      assert.equal(options.method, action === 'session' ? 'GET' : 'POST')
      assert.ok(!JSON.stringify(options.headers ?? {}).includes('fake-test-input'))
      assert.equal(options.body, action === 'login' ? JSON.stringify({ password: 'fake-test-input' }) : undefined)
      return Response.json(action === 'login' ? loggedIn : loggedOut)
    })
    assert.equal(response.authenticated, action === 'login')
  }
})

test('session client rejects malformed/expired responses and sanitizes status and transport errors without retries', async () => {
  for (const response of [{}, { authenticated: true, localDevelopment: false, expiresAt: Date.now() - 1 }, { authenticated: false, localDevelopment: 'false', expiresAt: null }]) await assert.rejects(sessionRequest('session', undefined, async () => Response.json(response)), /unexpected response/)
  for (const code of ['INVALID_LOGIN', 'REVIEWER_NOT_CONFIGURED', 'LOGIN_RATE_LIMITED', 'ORIGIN_REJECTED', 'UNKNOWN']) {
    let calls = 0
    await assert.rejects(sessionRequest('login', 'fake', async () => { calls++; return Response.json({ error: { code, message: 'private provider content' } }, { status: 401 }) }), error => !error.message.includes('private'))
    assert.equal(calls, 1)
  }
  await assert.rejects(sessionRequest('session', undefined, async () => { throw new Error('private network content') }), /Check your connection/)
})
