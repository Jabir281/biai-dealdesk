import { useCallback, useEffect, useRef, useState } from 'react'
import { sessionRequest } from './session-client'
import type { ReviewerSession } from './session-client'

export function useReviewerSession() {
  const [session, setSession] = useState<ReviewerSession | null>(null)
  const [pending, setPending] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [logoutFailed, setLogoutFailed] = useState(false)
  const [generation, setGeneration] = useState(0)
  const active = useRef(false)
  const mutating = useRef(false)
  const serial = useRef(0)
  const channel = useRef<BroadcastChannel | null>(null)
  const cancelChecks = useCallback(() => { serial.current++; active.current = false; mutating.current = false }, [])
  const invalidate = useCallback(() => {
    serial.current++; active.current = false; mutating.current = false
    setSession(null); setPending(false); setGeneration(value => value + 1)
    setNotice('Your reviewer session ended. Sign in again to use AI features.')
  }, [])
  const refresh = useCallback(async () => {
    if (active.current) return
    active.current = true
    const attempt = ++serial.current
    try {
      const result = await sessionRequest('session')
      if (attempt === serial.current) { setSession(result); setError('') }
    } catch (failure) {
      if (attempt === serial.current) { setSession(null); setError((failure as Error).message) }
    } finally {
      if (attempt === serial.current) { active.current = false; setPending(false) }
    }
  }, [])
  useEffect(() => {
    const startup = window.setTimeout(() => { void refresh() }, 0)
    const focus = () => { void refresh() }
    window.addEventListener('focus', focus)
    if ('BroadcastChannel' in window) {
      channel.current = new BroadcastChannel('biai-reviewer-access')
      channel.current.onmessage = () => { invalidate(); void refresh() }
    }
    return () => { window.clearTimeout(startup); window.removeEventListener('focus', focus); channel.current?.close(); cancelChecks() }
  }, [refresh, invalidate, cancelChecks])
  useEffect(() => {
    if (!session?.expiresAt) return
    const timer = setTimeout(invalidate, Math.max(0, session.expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [session, invalidate])

  async function login(password: string) {
    if (mutating.current) return
    // A deliberate login supersedes a background status check, but never another login.
    active.current = true; mutating.current = true; setPending(true); setError(''); setNotice(''); setLogoutFailed(false)
    const attempt = ++serial.current
    try {
      await sessionRequest('login', password)
      // Confirm the browser actually accepted the HttpOnly cookie before unlocking either view.
      const result = await sessionRequest('session')
      if (!result.authenticated) throw new Error('Sign-in could not be confirmed. Allow this site’s cookies and try again.')
      if (attempt === serial.current) { setSession(result); setNotice('Signed in. Both AI features are ready.'); channel.current?.postMessage('changed') }
    } catch (failure) { if (attempt === serial.current) { setSession(null); setError((failure as Error).message) } }
    finally { if (attempt === serial.current) { active.current = false; mutating.current = false; setPending(false) } }
  }
  async function logout() {
    if (mutating.current) return
    // Immediately lock and unmount AI workspaces, cancelling in-flight client requests.
    invalidate(); active.current = true; mutating.current = true; setPending(true); setError(''); setNotice('')
    const attempt = ++serial.current
    try {
      await sessionRequest('logout')
      if (attempt === serial.current) { setLogoutFailed(false); setNotice('Signed out. AI access is locked.'); channel.current?.postMessage('changed') }
    } catch { if (attempt === serial.current) { setLogoutFailed(true); setError('Sign-out could not be confirmed on the server. Retry sign-out before leaving this browser.') } }
    finally { if (attempt === serial.current) { active.current = false; mutating.current = false; setPending(false) } }
  }
  return { session, pending, error, notice, logoutFailed, generation, login, logout, refresh, invalidate,
    available: !pending && !logoutFailed && !!session && (session.authenticated || (import.meta.env.DEV && session.localDevelopment)) }
}
