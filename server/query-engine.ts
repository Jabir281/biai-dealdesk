import type { QueryAnswer, QueryFilter, QueryResponse } from '../src/ai/query-contract.ts'
import type { Lead } from '../src/data/leads.ts'
import { isOverdue, REFERENCE_DATE, STAGES } from '../src/data/leads.ts'
import { auditLeads } from '../src/data/health.ts'
import type { HealthIssue } from '../src/data/health.ts'
import { isIssueField, validateQueryPlan } from './query-plan.ts'

const labels: Record<QueryFilter['field'], string> = {
  id: 'Lead ID', company: 'Company', industry: 'Industry', contactName: 'Contact name', contactRole: 'Contact role',
  contactEmail: 'Email', contactPhone: 'Phone', source: 'Source', stage: 'Stage', dealValue: 'Agreed deal value (BDT)',
  lastContact: 'Last contact', nextFollowUp: 'Next follow-up', overdue: 'Overdue', valueAgreed: 'Value agreed',
  hasIssues: 'Has Data Health issues', issueCategory: 'Issue category', issueSeverity: 'Issue severity', issueCertainty: 'Issue certainty',
}
const operators: Record<QueryFilter['operator'], string> = {
  eq: 'equals', neq: 'does not equal', contains: 'contains', not_contains: 'does not contain', in: 'is one of', not_in: 'is not one of',
  gt: 'is after / greater than', gte: 'is on or after / at least', lt: 'is before / less than', lte: 'is on or before / at most',
  is_empty: 'is empty', is_present: 'is present',
}
function compare(value: string | number, target: string | number, operator: string) {
  switch (operator) {
    case 'eq': return value === target
    case 'neq': return value !== target
    case 'gt': return value > target
    case 'gte': return value >= target
    case 'lt': return value < target
    case 'lte': return value <= target
    default: return false
  }
}
function textMatches(value: string, filter: QueryFilter) {
  const text = value.trim().toLowerCase()
  const values = filter.values.map(item => item.toLowerCase())
  switch (filter.operator) {
    case 'is_empty': return text === ''
    case 'is_present': return text !== ''
    case 'contains': return text.includes(values[0])
    case 'not_contains': return !text.includes(values[0])
    case 'in': return values.includes(text)
    case 'not_in': return !values.includes(text)
    default: return compare(text, values[0], filter.operator)
  }
}
function issueMatches(issue: HealthIssue, filter: QueryFilter) {
  const value = filter.field === 'issueCategory' ? issue.category : filter.field === 'issueSeverity' ? issue.severity : issue.certainty
  return filter.values.includes(value)
}
function leadMatches(lead: Readonly<Lead>, filter: QueryFilter, issues: readonly HealthIssue[]) {
  const { field, operator, values } = filter
  if (field === 'overdue') return isOverdue(lead) === (values[0] === 'true')
  if (field === 'valueAgreed') return (Number(lead.dealValue) > 0) === (values[0] === 'true')
  if (field === 'hasIssues') return issues.some(issue => issue.leadIds.includes(lead.id)) === (values[0] === 'true')
  if (field === 'dealValue') return lead.dealValue !== null && lead.dealValue > 0 && compare(lead.dealValue, Number(values[0]), operator)
  if (field === 'stage' && ['gt', 'gte', 'lt', 'lte'].includes(operator)) {
    const index = STAGES.indexOf(lead.stage)
    return index < 5 && compare(index, STAGES.indexOf(values[0] as Lead['stage']), operator)
  }
  if (field === 'lastContact' || field === 'nextFollowUp') {
    if (operator === 'is_empty') return lead[field] === ''
    if (operator === 'is_present') return lead[field] !== ''
    return lead[field] !== '' && compare(lead[field], values[0], operator)
  }
  // Validated fields only; there is no dynamic code, regular-expression search or model tool execution.
  return textMatches(String(lead[field as keyof Lead] ?? ''), filter)
}
function groupMatches(lead: Readonly<Lead>, group: QueryFilter[], issues: readonly HealthIssue[], specificIssue?: HealthIssue) {
  const issueFilters = group.filter(filter => isIssueField(filter.field))
  return group.filter(filter => !isIssueField(filter.field)).every(filter => leadMatches(lead, filter, issues)) &&
    (issueFilters.length === 0 || (specificIssue ? [specificIssue] : issues.filter(issue => issue.leadIds.includes(lead.id)))
      .some(issue => issueFilters.every(filter => issueMatches(issue, filter))))
}
const agreedTotal = (leads: readonly Readonly<Lead>[]) => leads.reduce((total, lead) => total + (lead.dealValue && lead.dealValue > 0 ? Math.round(lead.dealValue * 100) : 0), 0) / 100
const money = (value: number) => new Intl.NumberFormat('en-BD', { maximumFractionDigits: 2 }).format(value)

export function executeQueryPlan(input: unknown, leads: readonly Readonly<Lead>[], question: string, model: string): QueryResponse {
  const plan = validateQueryPlan(input)
  if (plan.status !== 'query') {
    const messages = {
      ambiguous_question: 'Please restate the question with the stages, fields or dates you mean. Each question is independent; previous answers are not included.',
      unavailable_data: 'That information is not established by these source records. Ask about recorded fields or the existing Data Health checks; payments, owners, forecasts and external facts cannot be inferred.',
      unsupported_operation: 'This query needs an operation that is not supported. You can list or count leads, count Data Health issues, sum agreed BDT values, or group by stage or industry with filters and sorting.',
      unsafe_request: 'This view only reads pipeline data. It cannot change records, run instructions, reveal secrets, send messages or access external services.',
    }
    return { status: plan.status, question, message: messages[plan.reason as keyof typeof messages] }
  }
  const issues = auditLeads(leads)
  const groups = plan.filters.length ? plan.filters : [[]]
  let matched = leads.filter(lead => groups.some(group => groupMatches(lead, group, issues)))
  if (plan.operation === 'list' && plan.sortBy === 'dealValue') matched = matched.filter(lead => Number(lead.dealValue) > 0)
  const contributingIssues = (rows: readonly Readonly<Lead>[]) => issues.filter(issue => rows.some(lead => issue.leadIds.includes(lead.id) && groups.some(group => groupMatches(lead, group, issues, issue))))
  const selectedIssues = contributingIssues(matched)
  const metric = (rows: readonly Readonly<Lead>[]) => plan.measure === 'agreedValue' ? agreedTotal(rows) : plan.measure === 'issues' ? contributingIssues(rows).length : rows.length
  const criteria = [
    plan.filters.length ? plan.filters.map(group => `(${group.map(filter => `${labels[filter.field]} ${operators[filter.operator]}${filter.values.length ? ` ${filter.values.map(value => JSON.stringify(value)).join(', ')}` : ''}`).join(' AND ')})`).join(' OR ') : 'All original source records; no filters.',
    `Overdue means next follow-up strictly before ${REFERENCE_DATE}, including end stages. Missing dates are not overdue.`,
    'Text matches ignore case and surrounding spaces. Source records and duplicate candidates are retained.',
  ]
  if (plan.filters.some(group => group.some(filter => filter.field === 'stage' && ['gt', 'gte', 'lt', 'lte'].includes(filter.operator)))) criteria.push('Stage order comparisons use only New → Contacted → Meeting → Proposal → Invoice sent. Paid and Lost are separate end stages.')
  if (plan.filters.some(group => group.some(filter => isIssueField(filter.field)))) criteria.push('Combined issue filters must match the same existing audit issue. Leads are counted once; issues are counted by distinct issue ID.')
  if (plan.measure === 'agreedValue' || plan.sortBy === 'dealValue' || plan.filters.some(group => group.some(filter => filter.field === 'dealValue'))) criteria.push('Only values greater than zero are agreed amounts. Empty/zero amounts are excluded from value comparisons, value ranking and sums; they are not invented amounts.')
  const warnings: string[] = []
  const relatedIssues = issues.filter(issue => issue.leadIds.some(id => matched.some(lead => lead.id === id)))
  if (relatedIssues.length) warnings.push(`${relatedIssues.length} existing Data Health issues touch these records. Structured fields and notes may disagree; no data has been corrected.`)
  if (plan.measure === 'agreedValue') {
    const duplicates = issues.filter(issue => issue.category === 'Possible duplicate' && issue.leadIds.filter(id => matched.some(lead => lead.id === id && Number(lead.dealValue) > 0)).length > 1)
    if (duplicates.length) warnings.push(`Value totals may double-count suspected duplicate deals: ${duplicates.map(issue => issue.leadIds.join('/')).join(', ')}. All source amounts remain included; review before using the totals.`)
    const unagreed = matched.filter(lead => !lead.dealValue).map(lead => lead.id)
    if (unagreed.length) warnings.push(`Not agreed; excluded from value sums: ${unagreed.join(', ')}.`)
  }
  const result: QueryAnswer = {
    status: 'answer', question, model, referenceDate: REFERENCE_DATE, plan, answer: '', criteria, warnings,
    sourceCount: leads.length, matchedLeadIds: matched.map(lead => lead.id), displayedLeadIds: [],
    issueIds: selectedIssues.map(issue => issue.id), value: null, groups: [], records: matched.map(lead => ({ ...lead })),
  }
  if (plan.operation === 'group') {
    const groupBy = plan.groupBy as 'stage' | 'industry'
    const names = groupBy === 'stage' ? [...STAGES] : [...new Set(leads.map(lead => lead.industry))].sort((a, b) => a.localeCompare(b, 'en'))
    result.groups = names.map(label => {
      const rows = matched.filter(lead => lead[groupBy] === label)
      return { label: label || 'Not provided', value: metric(rows), leadIds: rows.map(lead => lead.id), issueIds: contributingIssues(rows).map(issue => issue.id) }
    })
    if (plan.sortBy === 'value') result.groups.sort((a, b) => (a.value - b.value) * (plan.direction === 'asc' ? 1 : -1) || names.indexOf(a.label) - names.indexOf(b.label))
    else if (plan.direction === 'desc') result.groups.reverse()
    criteria.push(`Grouped by ${groupBy}; all source groups shown, including zero matches. Sorted by ${plan.sortBy} ${plan.direction}. ${plan.sortBy === 'value' ? 'Ties use' : 'Group order follows'} ${groupBy === 'stage' ? 'official stage order' : 'alphabetical industry order'}.`)
    if (plan.measure === 'issues') warnings.push('A shared duplicate issue can appear in multiple groups. Group issue counts are not necessarily additive.')
    result.answer = `${matched.length} matching source leads, grouped by ${groupBy}. Each row shows ${plan.measure === 'agreedValue' ? 'the agreed value in BDT' : plan.measure === 'issues' ? 'distinct matching audit issues' : 'the lead count'}.`
    result.displayedLeadIds = [...result.matchedLeadIds]
  } else if (plan.operation === 'list') {
    const field = plan.sortBy as keyof Lead
    const sorted = [...matched].sort((a, b) => {
      const missingA = a[field] === '' || a[field] === null
      const missingB = b[field] === '' || b[field] === null
      if (missingA !== missingB) return missingA ? 1 : -1
      const order = field === 'dealValue' ? Number(a.dealValue) - Number(b.dealValue) : field === 'stage' ? STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) : String(a[field]).localeCompare(String(b[field]), 'en', { sensitivity: 'base' })
      return order * (plan.direction === 'asc' ? 1 : -1) || a.id.localeCompare(b.id)
    })
    result.displayedLeadIds = sorted.slice(0, plan.limit).map(lead => lead.id)
    criteria.push(`Sorted by ${labels[field as QueryFilter['field']]} ${plan.direction}; missing values last, ties by lead ID. Display limit ${plan.limit}; counts and source records cover all matches.`)
    result.answer = matched.length ? `Showing ${result.displayedLeadIds.length} of ${matched.length} matching source leads.` : 'No source leads match these criteria.'
  } else {
    result.value = metric(matched)
    result.displayedLeadIds = [...result.matchedLeadIds]
    result.answer = plan.measure === 'agreedValue'
      ? `BDT ${money(result.value)} in agreed deal value across ${matched.filter(lead => Number(lead.dealValue) > 0).length} of ${matched.length} matching source leads.`
      : plan.measure === 'issues' ? `${result.value} distinct matching Data Health issues across ${matched.length} matching source leads.` : `${result.value} matching source leads out of ${leads.length} original records.`
  }
  return result
}
