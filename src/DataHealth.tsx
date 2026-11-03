import { useState } from 'react'
import type { Lead } from './data/leads'
import { ISSUE_CATEGORIES, summarizeIssues } from './data/health'
import type { HealthIssue, IssueCategory } from './data/health'
import './DataHealth.css'

function SourceRecord({ lead }: { lead: Lead }) {
  const fields = [
    ['Lead ID', lead.id], ['Company', lead.company], ['Industry', lead.industry],
    ['Contact name', lead.contactName], ['Contact role', lead.contactRole],
    ['Email', lead.contactEmail], ['Phone', lead.contactPhone], ['Source', lead.source],
    ['Stage', lead.stage], ['Deal value (BDT, source)', lead.dealValue === null ? '' : String(lead.dealValue)],
    ['Last contact', lead.lastContact], ['Next follow-up', lead.nextFollowUp], ['Notes', lead.notes],
  ]
  return (
    <details className="health-source">
      <summary>Inspect {lead.id}: {lead.company}</summary>
      <dl>{fields.map(([label, value]) => <div key={label} className={label === 'Notes' ? 'health-source-notes' : ''}><dt>{label}</dt><dd>{value || <span className="secondary">Empty in source</span>}</dd></div>)}</dl>
    </details>
  )
}

export default function DataHealth({ leads, issues }: { leads: Lead[]; issues: HealthIssue[] }) {
  const [category, setCategory] = useState<IssueCategory | 'All categories'>('All categories')
  const summary = summarizeIssues(issues)
  const filtered = issues.filter((issue) => category === 'All categories' || issue.category === category)
  const filteredSummary = summarizeIssues(filtered)

  return (
    <div className="health-view">
      <div className="health-totals" aria-label="Audit totals">
        <p><strong>{summary.flaggedLeadIds.length} of {leads.length}</strong> unique leads flagged</p>
        <p><strong>{summary.issueCount}</strong> total issues</p>
        <p>{summary.definiteCount} definite errors <span aria-hidden="true">/</span> {summary.reviewCount} need review</p>
      </div>
      <details className="health-rules">
        <summary>How this audit counts and flags issues</summary>
        <ul>
          <li>One issue per missing name, email or phone field; contact role is optional. Missing fields and reversed dates are definite data errors under these audit rules.</li>
          <li>One issue per matching record pair, even if several fields match. Nonempty shared email, phone or normalized company name makes a review candidate, never an automatic merge.</li>
          <li>Email matching ignores case and surrounding spaces. Phone matching ignores punctuation and equates Bangladesh +880/00880 mobile prefixes with local 0. Company matching ignores case, punctuation, extra spaces and a trailing Ltd/Limited.</li>
          <li>Note checks recognize narrow, explicit statements about missing contact details, a partial advance with a second payment due, a sent proposal/price list, or an email typo. Notes may be outdated or wrong.</li>
          <li>Severity indicates review priority, not certainty: High for date order/payment conflict, Medium for missing contact/duplicate/other conflicts, Low for an email verification request.</li>
          <li>A lead is counted once in the flagged total, even with multiple issues. Both leads in a duplicate pair are counted. Category totals can overlap.</li>
          <li>Overdue follow-ups remain in Lead register; they are not automatically data errors. Missing last contact on a New lead is allowed. Missing follow-up dates and general email deliverability are outside this audit’s rules.</li>
        </ul>
        <p>Deterministic checks over the original records. No AI validation, corrections, deletions or merges.</p>
      </details>

      <section className="health-panel" aria-label="Data health issues">
        <div className="health-toolbar">
          <div><label htmlFor="health-category">Issue category</label><select id="health-category" value={category} onChange={(event) => setCategory(event.target.value as IssueCategory | 'All categories')}>
            <option>All categories</option>
            {ISSUE_CATEGORIES.map((item) => <option key={item} value={item}>{item} ({issues.filter((issue) => issue.category === item).length})</option>)}
          </select></div>
          <button type="button" className="clear-button" disabled={category === 'All categories'} onClick={() => setCategory('All categories')}>Clear category</button>
        </div>
        <p className="health-results" role="status">Showing {filtered.length} of {issues.length} issues across {filteredSummary.flaggedLeadIds.length} unique {filteredSummary.flaggedLeadIds.length === 1 ? 'lead' : 'leads'}</p>
        {filtered.length === 0 ? <div className="empty-state"><h2>No issues in this category</h2><p>Choose another category to review other findings. No flags does not guarantee that a record is correct.</p></div> : (
          <ul className="health-issues">{filtered.map((issue) => (
            <li key={issue.id} className="health-issue" data-issue-id={issue.id}>
              <div className="health-issue-heading">
                <div><p className="health-category">{issue.category}</p><h2>{issue.title}</h2></div>
                <div className="health-badges"><span className={`health-severity health-severity-${issue.severity.toLowerCase()}`}>{issue.severity} priority</span><span className="health-certainty">{issue.certainty}</span></div>
              </div>
              <p className="health-leads">{issue.leadIds.map((id) => `${id}: ${leads.find((lead) => lead.id === id)?.company ?? 'Unknown lead'}`).join(' / ')}</p>
              <div className="health-explanation">
                <div><h3>Evidence</h3><ul>{issue.evidence.map((item) => <li key={item}>{item}</li>)}</ul></div>
                <div><h3>Suggested human action</h3><p>{issue.action}</p></div>
              </div>
              {issue.leadIds.map((id) => {
                const lead = leads.find((item) => item.id === id)
                return lead ? <SourceRecord key={id} lead={lead} /> : null
              })}
            </li>
          ))}</ul>
        )}
      </section>
      <p className="health-footnote">All {leads.length} source records remain unchanged in Lead register. These checks identify evidence to review, not a verified count of every possible data problem.</p>
    </div>
  )
}
