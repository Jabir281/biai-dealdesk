import { useRef, useState } from 'react'
import type { useReviewerSession } from './auth/useReviewerSession'
import './ReviewerAccess.css'

export default function ReviewerAccess({ access }: { access: ReturnType<typeof useReviewerSession> }) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const field = useRef<HTMLInputElement | null>(null)
  const local = access.available && access.session?.localDevelopment && !access.session.authenticated
  return <section className="reviewer-access" aria-label="Reviewer access">
    <div className="reviewer-bar">
      <div><strong>{access.pending ? 'Checking reviewer access…' : access.session?.authenticated ? 'Reviewer signed in' : local ? 'Local development access' : 'Reviewer access'}</strong>
        <p>{access.session?.authenticated ? 'AI Follow-up and Ask Your Pipeline are unlocked for this session.' : local ? 'AI features are available on this computer.' : 'Sign in to use both AI features. The lead register and Data Health remain open.'}</p></div>
      {access.session?.authenticated || access.logoutFailed ? <button type="button" className="reviewer-secondary" disabled={access.pending} onClick={() => { setPassword(''); void access.logout() }}>{access.logoutFailed ? 'Retry sign-out' : 'Sign out'}</button> : !local && <button type="button" disabled={access.pending} aria-expanded={open} aria-controls="reviewer-login" onClick={() => { setOpen(value => !value); setPassword(''); requestAnimationFrame(() => field.current?.focus()) }}>{open ? 'Close sign-in' : 'Reviewer sign in'}</button>}
    </div>
    {!access.session?.authenticated && !local && open && <form id="reviewer-login" className="reviewer-form" onSubmit={event => { event.preventDefault(); const submitted = password; setPassword(''); void access.login(submitted) }}>
      <div><label htmlFor="reviewer-password">Reviewer password</label><input ref={field} id="reviewer-password" type="password" autoComplete="current-password" maxLength={128} required value={password} disabled={access.pending} aria-describedby="reviewer-help" onChange={event => setPassword(event.target.value)} /><p id="reviewer-help">Use the shared password supplied by the BIAI project owner. Sessions last up to two hours.</p></div>
      <button type="submit" disabled={access.pending || !password}>{access.pending ? 'Signing in…' : 'Sign in'}</button>
    </form>}
    <p className="reviewer-status" role="status">{access.notice}</p>
    {access.error && <div className="reviewer-error" role="alert"><p>{access.error}</p>{!open && !access.logoutFailed && <button type="button" className="reviewer-secondary" disabled={access.pending} onClick={() => void access.refresh()}>Check access again</button>}</div>}
  </section>
}
