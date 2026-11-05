import { useEffect, useState } from 'react'
import csv from './data/corporate-leads.csv?raw'
import { duplicateIds, filterLeads, formatDate, formatDealValue, isOverdue, parseLeads, REFERENCE_DATE, STAGES } from './data/leads'
import type { Lead, Stage } from './data/leads'
import { auditLeads } from './data/health'
import DataHealth from './DataHealth'
import AiFollowUp from './AiFollowUp'
import AskPipeline from './AskPipeline'
import ReviewerAccess from './ReviewerAccess'
import { useReviewerSession } from './auth/useReviewerSession'
import './App.css'

function loadSource(): { leads: Lead[]; error: string | null } {
  try {
    const leads = parseLeads(csv)
    if (leads.length !== 25) throw new Error(`Expected 25 source leads; found ${leads.length}.`)
    return { leads, error: null }
  } catch (error) {
    return { leads: [], error: error instanceof Error ? error.message : 'Unable to read the source CSV.' }
  }
}
const source = loadSource()
const overdueCount = source.leads.filter(isOverdue).length
const healthIssues = auditLeads(source.leads)

function LeadRow({ lead }: { lead: Lead }) {
  const overdue = isOverdue(lead)
  const duplicates = duplicateIds(lead, source.leads)
  const dateOrderError = lead.lastContact && lead.nextFollowUp && lead.nextFollowUp < lead.lastContact
  return (
    <tr className={overdue ? 'lead-row is-overdue' : 'lead-row'}>
      <th scope="row" className="company-cell">
        <span className="lead-id">{lead.id}</span>
        <span className="company-name">{lead.company}</span>
        {duplicates.length > 0 && <span className="review-note">Possible duplicate of {duplicates.join(', ')} · review</span>}
        <details className="source-notes"><summary>Source notes</summary><p>{lead.notes || 'No notes recorded.'}</p></details>
      </th>
      <td data-label="Contact" className="contact-cell">
        <span className="contact-name">{lead.contactName || 'Name missing'}</span>
        {lead.contactRole && <span className="secondary">{lead.contactRole}</span>}
        <span className={lead.contactEmail ? 'contact-detail' : 'review-note'}>{lead.contactEmail || 'Email missing'}</span>
        <span className={lead.contactPhone ? 'contact-detail' : 'review-note'}>{lead.contactPhone || 'Phone missing'}</span>
      </td>
      <td data-label="Industry">{lead.industry || 'Not provided'}</td>
      <td data-label="Stage"><span className={`stage-badge stage-${STAGES.indexOf(lead.stage)}`}><span aria-hidden="true" />{lead.stage}</span></td>
      <td data-label="Deal value (BDT)" className={`value-cell${!lead.dealValue ? ' secondary' : ''}`}>{formatDealValue(lead.dealValue)}</td>
      <td data-label="Next follow-up" className="follow-up-cell">
        {lead.nextFollowUp ? <time dateTime={lead.nextFollowUp}>{formatDate(lead.nextFollowUp)}</time> : <span className="secondary">Not scheduled</span>}
        {overdue && <span className="overdue-label">Overdue</span>}
        {lead.nextFollowUp === REFERENCE_DATE && <span className="reference-due">Due on reference date</span>}
        {dateOrderError && <span className="review-note">Before last contact ({formatDate(lead.lastContact)}). Review date.</span>}
      </td>
    </tr>
  )
}

function App() {
  const access = useReviewerSession()
  const [view, setView] = useState<'register' | 'health' | 'followup' | 'query'>('register')
  const viewTitle = view === 'register' ? 'Lead register' : view === 'health' ? 'Data health' : view === 'query' ? 'Q&A' : 'AI Follow-up'
  useEffect(() => {
    document.title = `${viewTitle} | BIAI DealDesk`
  }, [viewTitle])
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<Stage | 'All stages'>('All stages')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const filtered = filterLeads(source.leads, { search, stage, overdueOnly })
  const hasFilters = search !== '' || stage !== 'All stages' || overdueOnly
  function clearFilters() { setSearch(''); setStage('All stages'); setOverdueOnly(false) }

  return (
    <>
      <a className="skip-link" href="#register">Skip to {viewTitle}</a>
      <header className="app-header"><div className="header-inner">
        <div className="brand"><span className="brand-mark">BIAI</span><span>DealDesk</span></div>

      </div></header>
      <main id="register">
        <nav className="view-nav" aria-label="Main navigation">
          <button type="button" aria-current={view === 'register' ? 'page' : undefined} onClick={() => setView('register')}>Lead register</button>
          <button type="button" aria-current={view === 'health' ? 'page' : undefined} onClick={() => setView('health')}>Data health</button>
          <button type="button" aria-current={view === 'followup' ? 'page' : undefined} onClick={() => setView('followup')}>AI Follow-up</button>
          <button type="button" aria-current={view === 'query' ? 'page' : undefined} onClick={() => setView('query')}>Q&A</button>
        </nav>
        <section className="page-heading" aria-labelledby="page-title">
          <div><h1 id="page-title">{viewTitle}</h1><p>{view === 'register' ? 'Corporate training opportunities, from first contact to close.' : view === 'health' ? 'Review data issues with evidence from the original records.' : view === 'query' ? 'Ask AI questions about your corporate leads.' : 'A thoughtful next message, grounded in your lead’s notes.'}</p></div>
          <div className="reference-date"><span>Follow-up reference date</span><strong><time dateTime={REFERENCE_DATE}>{formatDate(REFERENCE_DATE)}</time></strong></div>
        </section>
        <ReviewerAccess access={access} />
        {!source.error && <div hidden={view !== 'followup'}><AiFollowUp key={`${access.generation}-${access.available}`} leads={source.leads} issues={healthIssues} available={access.available} onUnauthorized={access.invalidate} /></div>}
        {!source.error && <div hidden={view !== 'query'}><AskPipeline key={`${access.generation}-${access.available}`} available={access.available} onUnauthorized={access.invalidate} /></div>}
        {source.error ? (
          <section className="error-state" role="alert"><h2>Lead data could not be loaded</h2><p>{source.error}</p><p>Check the bundled corporate-leads.csv against the original source, then reload.</p></section>
        ) : view === 'followup' || view === 'query' ? null : view === 'health' ? <DataHealth leads={source.leads} issues={healthIssues} /> : (
          <>
            <div className="register-summary">
              <p><strong>{source.leads.length}</strong> source leads <span className="summary-divider" aria-hidden="true" /> <strong className="overdue-total">{overdueCount}</strong> overdue follow-ups</p>
              <span>Original records retained, including duplicates</span>
            </div>
            <section className="register-panel" aria-label="Corporate leads">
              <form className="filters" onSubmit={(event) => event.preventDefault()} role="search" aria-label="Filter leads">
                <div className="search-field"><label htmlFor="lead-search">Search company or contact</label><div className="search-input">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
                  <input id="lead-search" type="search" placeholder="Company, contact or ID" value={search} onChange={(event) => setSearch(event.target.value)} />
                </div></div>
                <div className="stage-field"><label htmlFor="stage-filter">Pipeline stage</label><select id="stage-filter" value={stage} onChange={(event) => setStage(event.target.value as Stage | 'All stages')}><option>All stages</option>{STAGES.map((item) => <option key={item}>{item}</option>)}</select></div>
                <label className="overdue-toggle"><input type="checkbox" checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} /><span>Overdue only</span></label>
                <button type="button" className="clear-button" disabled={!hasFilters} onClick={clearFilters}>Clear filters</button>
              </form>
              <div className="results-bar"><p role="status" aria-live="polite">Showing <strong>{filtered.length}</strong> of <strong>{source.leads.length}</strong> source leads</p><span>Deal values in BDT</span></div>
              {filtered.length > 0 ? (
                <table className="lead-table">
                  <caption className="sr-only">Corporate leads in original source order. Overdue means a follow-up before 1 November 2026.</caption>
                  <thead><tr><th scope="col">Company / Lead ID</th><th scope="col">Contact</th><th scope="col">Industry</th><th scope="col">Pipeline stage</th><th scope="col" className="value-cell">Deal value <span>(BDT)</span></th><th scope="col">Next follow-up</th></tr></thead>
                  <tbody>{filtered.map((lead) => <LeadRow key={lead.id} lead={lead} />)}</tbody>
                </table>
              ) : (
                <div className="empty-state"><h2>No leads match these filters</h2><p>Try a different company or contact, or clear the filters to see all source leads.</p><button type="button" onClick={clearFilters}>Clear filters</button></div>
              )}
            </section>
            
          </>
        )}
      </main>
    </>
  )
}
export default App
