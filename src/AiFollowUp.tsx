import { useEffect, useRef, useState } from 'react'
import type { Lead } from './data/leads'
import { STAGES } from './data/leads'
import type { HealthIssue } from './data/health'
import { DraftRequestError, formatEmail, requestDraft, SOURCE_FIELD_LABELS } from './ai/draft-client'
import type { EmailDraft } from './ai/draft-client'
import './AiFollowUp.css'

interface EditableDraft extends EmailDraft { edited: boolean }

export default function AiFollowUp({ leads, issues, available, onUnauthorized }: { leads: Lead[]; issues: HealthIssue[]; available: boolean; onUnauthorized: () => void }) {
  const [selectedId, setSelectedId] = useState('')
  const [drafts, setDrafts] = useState<Record<string, EditableDraft>>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState('')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const request = useRef<AbortController | null>(null)
  const copyAttempt = useRef(0)
  const lead = leads.find((item) => item.id === selectedId)
  const draft = drafts[selectedId]
  const flagged = issues.filter((issue) => issue.leadIds.includes(selectedId))

  useEffect(() => () => { request.current?.abort(); copyAttempt.current++ }, [])

  function selectLead(id: string) {
    if (request.current) return
    copyAttempt.current++
    setSelectedId(id); setError(null); setCopyFeedback(''); setConfirmReplace(false)
  }

  async function generate() {
    if (!lead || !available || request.current) return
    if (draft && !confirmReplace) { setConfirmReplace(true); return }
    const controller = new AbortController()
    request.current = controller
    setPending(true); setError(null); setCopyFeedback(''); setConfirmReplace(false)
    copyAttempt.current++
    try {
      const result = await requestDraft(lead.id, { signal: controller.signal })
      if (!controller.signal.aborted) setDrafts((previous) => ({ ...previous, [lead.id]: { ...result, edited: false } }))
    } catch (failure) {
      if (failure instanceof DraftRequestError && failure.code === 'UNAUTHORIZED') onUnauthorized()
      if (!controller.signal.aborted) setError(failure instanceof DraftRequestError ? failure.message : 'The draft request could not be completed. Try again later.')
    } finally {
      if (request.current === controller) { request.current = null; setPending(false) }
    }
  }

  function edit(field: 'subject' | 'body', value: string) {
    copyAttempt.current++
    setDrafts((previous) => ({ ...previous, [selectedId]: { ...previous[selectedId], [field]: value, edited: true } }))
    setCopyFeedback('')
  }

  async function copy(part: 'Subject' | 'Body' | 'Email') {
    if (!draft) return
    const attempt = ++copyAttempt.current
    setCopyFeedback('')
    try {
      await navigator.clipboard.writeText(part === 'Email' ? formatEmail(draft) : draft[part === 'Subject' ? 'subject' : 'body'])
      if (attempt === copyAttempt.current) setCopyFeedback(`${part} copied to clipboard.`)
    } catch {
      if (attempt === copyAttempt.current) setCopyFeedback('Copy was blocked by the browser. Select the text and copy it manually.')
    }
  }

  return (
    <div className="followup-view">
      <p className="followup-intro">Draft from the original lead context, then review and edit. Nothing is sent.</p>
      {!available && <div className="followup-notice" role="note"><strong>Sign in to generate a draft.</strong><p>Use Reviewer access above. You can review all original lead context without signing in.</p></div>}
      <div className="followup-workspace">
        <section className="followup-context" aria-labelledby="context-heading">
          <div className="followup-section-heading"><h2 id="context-heading">Lead context</h2><span>{leads.length} original leads</span></div>
          <label htmlFor="draft-lead">Select a lead</label>
          <select id="draft-lead" value={selectedId} disabled={pending} onChange={(event) => selectLead(event.target.value)}>
            <option value="">Choose a lead…</option>
            {leads.map((item) => <option key={item.id} value={item.id}>{item.id} — {item.company}</option>)}
          </select>
          {lead ? <>
            <div className="followup-company"><p>{lead.id}</p><h3>{lead.company}</h3><span className={`stage-badge stage-${STAGES.indexOf(lead.stage)}`}><span aria-hidden="true" />{lead.stage}</span></div>
            <dl className="followup-contact">
              <div><dt>Contact</dt><dd>{lead.contactName || 'Name missing'}{lead.contactRole && <span>{lead.contactRole}</span>}</dd></div>
              <div><dt>Email</dt><dd>{lead.contactEmail || 'Email missing'}</dd></div>
            </dl>
            <div className="followup-notes"><h3>Source notes</h3><p>{lead.notes || 'No notes recorded.'}</p></div>
            {flagged.length > 0 && <div className="followup-warning" role="note" aria-label="Data health warning">
              <strong>Review {flagged.length} data health {flagged.length === 1 ? 'issue' : 'issues'} before using a draft</strong>
              <ul>{flagged.map((issue) => <li key={issue.id}><span>{issue.title}</span><small>{issue.certainty}</small></li>)}</ul>
              <p>Check Data health for evidence. Source fields and notes may disagree.</p>
            </div>}
          </> : <p className="followup-context-empty">Choose one of the 25 source records to review its contact, stage and notes. Duplicate records keep their original IDs.</p>}
          <div className="followup-generate">
            {confirmReplace ? <div className="followup-replace" role="group" aria-label="Confirm draft replacement"><p>A new draft will replace this lead’s current draft and edits only if generation succeeds.</p><button type="button" onClick={() => void generate()}>Generate replacement</button><button className="followup-secondary" type="button" onClick={() => setConfirmReplace(false)}>Keep current draft</button></div> : <button type="button" disabled={!lead || pending || !available} onClick={() => void generate()}>{pending ? 'Generating draft…' : 'Generate Draft'}</button>}
          </div>
        </section>
        <section className="followup-editor" aria-labelledby="draft-heading" aria-busy={pending}>
          <div className="followup-section-heading"><h2 id="draft-heading">Email draft</h2><span>Review before use</span></div>
          <p className="followup-status" role="status" aria-atomic="true">{pending ? 'Generating a draft. This can take up to 25 seconds.' : draft ? `${draft.edited ? 'Edited AI draft' : 'AI draft ready'} for ${draft.leadId}. Nothing has been sent.` : ''}</p>
          {error && <div className="followup-error" role="alert"><strong>Draft generation failed</strong><p>{error}</p><p>{draft ? 'Your previous draft and edits are still below.' : 'No draft was created.'}</p></div>}
          {draft ? <>
            <div className="followup-editor-field"><label htmlFor="draft-subject">Subject</label><input id="draft-subject" value={draft.subject} disabled={pending} onChange={(event) => edit('subject', event.target.value)} /></div>
            <div className="followup-editor-field"><label htmlFor="draft-body">Body</label><textarea id="draft-body" rows={11} value={draft.body} disabled={pending} onChange={(event) => edit('body', event.target.value)} /></div>
            <div className="followup-copy-actions" aria-label="Copy draft">
              <button className="followup-secondary" type="button" disabled={pending || !draft.subject.trim()} onClick={() => void copy('Subject')}>Copy Subject</button>
              <button className="followup-secondary" type="button" disabled={pending || !draft.body.trim()} onClick={() => void copy('Body')}>Copy Body</button>
              <button type="button" disabled={pending || !draft.subject.trim() || !draft.body.trim()} onClick={() => void copy('Email')}>Copy Email</button>
            </div>
            <p className="followup-copy-feedback" role="status" aria-atomic="true">{copyFeedback}</p>
            <div className="followup-provenance"><h3>Source fields used for {draft.leadId}</h3><ul>{draft.sourceFields.map((field) => <li key={field}>{SOURCE_FIELD_LABELS[field]}</li>)}</ul><p>These fields were supplied to the AI. Check the draft against the source notes; they do not prove every statement is correct.</p></div>
          </> : <div className="followup-empty"><svg width="42" height="42" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><rect x="5" y="3" width="22" height="26" rx="2" /><path d="M10 10h12M10 16h12M10 22h8" /></svg><h3>{pending ? 'Preparing your follow-up' : 'Your draft starts with the lead'}</h3><p>{pending ? 'The original record is being used to draft a short English follow-up.' : 'Select a lead and choose Generate Draft. A successful response will appear here for review, editing and copying.'}</p></div>}
        </section>
      </div>
    </div>
  )
}
