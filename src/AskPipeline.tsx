import { useEffect, useRef, useState } from 'react'
import { QueryRequestError, requestQuery } from './ai/query-client'
import type { QueryAnswer, QueryResponse } from './ai/query-contract'
import { formatDate, formatDealValue, STAGES } from './data/leads'
import './AskPipeline.css'

const examples = ['Which leads have overdue follow-ups and an agreed deal value?', 'Compare the agreed BDT totals across stages.', 'Which contacts are missing an email address?']
const amount = (value: number) => new Intl.NumberFormat('en-BD', { maximumFractionDigits: 2 }).format(value)

function Answer({ result }: { result: QueryAnswer }) {
  const shown = result.displayedLeadIds.map(id => result.records.find(record => record.id === id)!).filter(Boolean)
  return <>
    <div className="query-answer-heading"><span>Calculated from source records</span><h2>{result.answer}</h2></div>
    <p className="query-support">Matching lead IDs: {result.matchedLeadIds.join(', ') || 'None'}</p>
    {result.warnings.length > 0 && <div className="query-warning" role="note" aria-label="Result cautions"><strong>Before using this result</strong><ul>{result.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
    {result.groups.length > 0 && <div className="query-table-wrap"><table className="query-table"><caption>Grouped summary</caption><thead><tr><th scope="col">Group</th><th scope="col">{result.plan.measure === 'agreedValue' ? 'Agreed value (BDT)' : result.plan.measure === 'issues' ? 'Distinct issues' : 'Lead count'}</th><th scope="col">Supporting IDs</th></tr></thead><tbody>{result.groups.map(group => <tr key={group.label}><th scope="row">{group.label}</th><td>{amount(group.value)}</td><td>{group.leadIds.join(', ') || 'None'}</td></tr>)}</tbody></table></div>}
    {result.plan.operation === 'list' && shown.length > 0 && <ol className="query-matches" aria-label="Matching leads">{shown.map(lead => <li key={lead.id}><div><strong>{lead.id}: {lead.company}</strong><p>{lead.contactName || 'Contact name missing'}{lead.contactRole ? ` — ${lead.contactRole}` : ''}</p></div><div><span className={`stage-badge stage-${STAGES.indexOf(lead.stage)}`}>{lead.stage}</span><p>{lead.dealValue ? `BDT ${formatDealValue(lead.dealValue)}` : 'Value not agreed'}</p></div></li>)}</ol>}
    <details className="query-criteria" open><summary>How this was calculated</summary><ul>{result.criteria.map(criterion => <li key={criterion}>{criterion}</li>)}</ul><p>Gemini selected these criteria. The result was computed in TypeScript from the original records. Check that the interpretation matches your question.</p></details>
    <details className="query-sources"><summary>Inspect {result.records.length} matching source {result.records.length === 1 ? 'record' : 'records'}</summary>
      {result.records.length === 0 ? <p>No original records matched. Try a different criterion.</p> : result.records.map(lead => <details className="query-source" key={lead.id}><summary>{lead.id}: {lead.company}</summary><dl>
        <div><dt>Stage / industry</dt><dd>{lead.stage} / {lead.industry || 'Not provided'}</dd></div>
        <div><dt>Agreed value (BDT)</dt><dd>{formatDealValue(lead.dealValue)}</dd></div>
        <div><dt>Contact</dt><dd>{lead.contactName || 'Name missing'}{lead.contactRole && ` — ${lead.contactRole}`}</dd></div>
        <div><dt>Email / phone</dt><dd>{lead.contactEmail || 'Email missing'}<br />{lead.contactPhone || 'Phone missing'}</dd></div>
        <div><dt>Last contact</dt><dd>{lead.lastContact ? formatDate(lead.lastContact) : 'Not recorded'}</dd></div>
        <div><dt>Next follow-up</dt><dd>{formatDate(lead.nextFollowUp)}</dd></div>
        <div className="query-source-notes"><dt>Source notes</dt><dd>{lead.notes || 'No notes recorded'}</dd></div>
      </dl></details>)}
    </details>
  </>
}

export default function AskPipeline({ available, onUnauthorized }: { available: boolean; onUnauthorized: () => void }) {
  const [question, setQuestion] = useState('')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<QueryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  const input = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => () => { request.current?.abort() }, [])

  async function ask() {
    if (!available || request.current || !question.trim() || question.length > 800) return
    const controller = new AbortController()
    request.current = controller
    setPending(true); setError(null); setResult(null)
    try {
      const response = await requestQuery(question, { signal: controller.signal })
      if (!controller.signal.aborted) setResult(response)
    } catch (failure) {
      if (failure instanceof QueryRequestError && failure.code === 'UNAUTHORIZED') onUnauthorized()
      if (!controller.signal.aborted) setError(failure instanceof QueryRequestError ? failure.message : 'The question could not be completed. Try again later.')
    } finally {
      if (request.current === controller) { request.current = null; setPending(false) }
    }
  }

  return <div className="query-view">
    <p className="query-method">Gemini interprets your question. TypeScript calculates the answer from the 25 original leads and their Data Health results.</p>
    {!available && <div className="query-warning" role="note"><strong>Sign in to ask your pipeline.</strong><p>Use Reviewer access above to unlock questions and AI Follow-up.</p></div>}
    <form className="query-form" onSubmit={event => { event.preventDefault(); void ask() }} aria-label="Ask about the pipeline">
      <label htmlFor="pipeline-question">Your question</label>
      <textarea ref={input} id="pipeline-question" rows={3} maxLength={800} value={question} disabled={pending} placeholder="Ask about leads, follow-ups, stages, values or data issues…" onChange={event => setQuestion(event.target.value)} aria-describedby="question-help question-length" />
      <div className="query-form-actions"><p id="question-help">Each question stands alone. Include the criteria again when asking a follow-up.</p><span id="question-length">{question.length}/800</span><button type="submit" disabled={!available || pending || !question.trim()}>{pending ? 'Interpreting…' : 'Ask'}</button></div>
      <div className="query-examples"><span>Try a question</span>{examples.map(example => <button key={example} type="button" disabled={pending} onClick={() => { setQuestion(example); input.current?.focus() }}>{example}</button>)}</div>
    </form>
    <p className="query-status" role="status">{pending ? 'Gemini is interpreting your question. Calculations will use the original records.' : result ? result.status === 'answer' ? 'Answer calculated. Review the criteria and source records below.' : 'This question needs clarification or is outside the supported data.' : ''}</p>
    {error && <div className="query-error" role="alert"><h2>Question could not be answered</h2><p>{error}</p><p>No substitute or estimated answer has been generated.</p></div>}
    {result ? <section className="query-result" aria-label="Question result">
      <p className="query-answered-question"><strong>Your question</strong>{result.question}</p>
      {result.status === 'answer' ? <Answer result={result} /> : <div className="query-limitation"><h2>{result.status === 'clarify' ? 'Clarify your question' : 'Outside the available data or operations'}</h2><p>{result.message}</p><button className="query-secondary" type="button" onClick={() => input.current?.focus()}>Revise question</button></div>}
    </section> : !error && !pending && <section className="query-empty"><h2>Ask a question you can check</h2><p>Explore matching leads, counts, agreed BDT totals or summaries by stage and industry. Answers show the applied criteria and supporting lead IDs.</p><p>All original records are retained, including suspected duplicates. Overdue uses 1 November 2026.</p></section>}
  </div>
}
