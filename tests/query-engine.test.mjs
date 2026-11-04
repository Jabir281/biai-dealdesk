import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadSourceLeads } from '../server/source-leads.ts'
import { validateQueryPlan } from '../server/query-plan.ts'
import { executeQueryPlan } from '../server/query-engine.ts'

const leads = loadSourceLeads()
const base = { status: 'query', reason: 'none', operation: 'count', measure: 'leads', filters: [], groupBy: 'none', sortBy: 'id', direction: 'asc', limit: 25 }
const filter = (field, operator, ...values) => ({ field, operator, values })
const run = changes => executeQueryPlan({ ...base, ...changes }, leads, 'Test question', 'gemini-3.5-flash-lite')

test('complete schema rejects extra keys, unsafe fields/operations, coercions and incompatible combinations', () => {
  assert.deepEqual(validateQueryPlan(base), base)
  const bad = [null, {}, [], { ...base, answer: '999' }, { ...base, total: 999 }, { ...base, operation: 'eval' },
    { ...base, groupBy: '__proto__' }, { ...base, sortBy: 'notes' }, { ...base, direction: 'sideways' },
    { ...base, limit: '25' }, { ...base, limit: 0 }, { ...base, limit: 26 }, { ...base, limit: 1.5 },
    { ...base, operation: 'sum' }, { ...base, measure: 'agreedValue' }, { ...base, operation: 'group' },
    { ...base, operation: 'list', measure: 'issues' }, { ...base, reason: 'unsafe_request' },
    { ...base, filters: [[]] }, { ...base, filters: Array(5).fill([filter('overdue', 'eq', 'true')]) },
    { ...base, filters: [Array(7).fill(filter('overdue', 'eq', 'true'))] },
    { ...base, filters: [[{ ...filter('company', 'eq', 'anything'), code: 'process.exit()' }]] },
  ]
  for (const plan of bad) assert.throws(() => validateQueryPlan(plan))
  for (const item of [filter('notes', 'contains', 'instruction'), filter('__proto__', 'eq', 'yes'), filter('company', 'regex', '.*'),
    filter('stage', 'eq', 'Closed won'), filter('stage', 'gt', 'Paid'), filter('overdue', 'eq', 'yes'),
    filter('hasIssues', 'neq', 'true'), filter('dealValue', 'gt', 'NaN'), filter('dealValue', 'eq', '-1'),
    filter('dealValue', 'gt', '1e5'), filter('dealValue', 'eq', '1000000000001'), filter('dealValue', 'eq', '12.123'),
    filter('nextFollowUp', 'lt', '2026-02-30'), filter('nextFollowUp', 'lt', 'yesterday'),
    filter('issueCategory', 'eq', 'Overdue'), filter('issueSeverity', 'neq', 'High'),
    filter('company', 'eq'), filter('company', 'is_empty', 'x'), filter('company', 'in'), filter('id', 'eq', 'L1'),
    filter('company', 'eq', ' leading'), filter('company', 'eq', 'x'.repeat(161)), filter('company', 'eq', 'a\nb')]) {
    assert.throws(() => validateQueryPlan({ ...base, filters: [[item]] }), JSON.stringify(item))
  }
})

test('overdue uses the fixed date, includes exactly nine IDs, and excludes L09', () => {
  const result = run({ filters: [[filter('overdue', 'eq', 'true')]] })
  assert.equal(result.value, 9)
  assert.deepEqual(result.matchedLeadIds, ['L04', 'L06', 'L10', 'L13', 'L15', 'L19', 'L20', 'L22', 'L25'])
  assert.deepEqual(run({ filters: [[filter('nextFollowUp', 'eq', '2026-11-01')]] }).matchedLeadIds, ['L09'])
  assert.equal(run({ filters: [[filter('id', 'eq', 'L24'), filter('lastContact', 'lt', '2026-11-01')]] }).value, 0)
})

test('AND/OR text, stage and contact filters operate on actual records without question recognition', () => {
  const result = run({ filters: [[filter('stage', 'eq', 'Proposal')], [filter('contactName', 'contains', 'TANVIR')]] })
  const expected = leads.filter(lead => lead.stage === 'Proposal' || lead.contactName.toLowerCase().includes('tanvir')).map(lead => lead.id)
  assert.deepEqual(result.matchedLeadIds, expected)
  assert.deepEqual(run({ filters: [[filter('company', 'contains', 'padma')]] }).matchedLeadIds, ['L01', 'L23'])
  assert.deepEqual(run({ filters: [[filter('contactEmail', 'eq', leads[1].contactEmail.toUpperCase())]] }).matchedLeadIds, ['L02', 'L03'])
  assert.deepEqual(run({ filters: [[filter('stage', 'gt', 'Meeting')]] }).matchedLeadIds, leads.filter(lead => ['Proposal', 'Invoice sent'].includes(lead.stage)).map(lead => lead.id))
})

test('agreed BDT totals match independent sums and warn for both known duplicate groups', () => {
  const all = run({ operation: 'sum', measure: 'agreedValue' })
  assert.equal(all.value, leads.reduce((sum, lead) => sum + (lead.dealValue || 0), 0))
  assert.ok(all.warnings.some(text => text.includes('L01/L23') && text.includes('L02/L03') && text.includes('double-count')))
  const proposal = run({ operation: 'sum', measure: 'agreedValue', filters: [[filter('stage', 'eq', 'Proposal')]] })
  assert.equal(proposal.value, leads.filter(lead => lead.stage === 'Proposal').reduce((sum, lead) => sum + (lead.dealValue || 0), 0))
  const noValue = run({ operation: 'sum', measure: 'agreedValue', filters: [[filter('id', 'eq', 'L04')]] })
  assert.equal(noValue.value, 0)
  assert.match(noValue.answer, /across 0 of 1/)
  assert.ok(noValue.warnings.some(text => text.includes('Not agreed')))
})

test('lowest/highest lists exclude unagreed amounts and distinguish limited display from all matches', () => {
  for (const direction of ['asc', 'desc']) {
    const result = run({ operation: 'list', sortBy: 'dealValue', direction, limit: 3 })
    const expected = leads.filter(lead => lead.dealValue > 0).sort((a, b) => (a.dealValue - b.dealValue) * (direction === 'asc' ? 1 : -1) || a.id.localeCompare(b.id))
    assert.deepEqual(result.displayedLeadIds, expected.slice(0, 3).map(lead => lead.id))
    assert.equal(result.matchedLeadIds.length, expected.length)
    assert.equal(result.records.length, expected.length)
  }
  const notAgreed = run({ filters: [[filter('valueAgreed', 'eq', 'false')]] })
  assert.deepEqual(notAgreed.matchedLeadIds, leads.filter(lead => !lead.dealValue).map(lead => lead.id))
})

test('Data Health counts distinguish ten leads/ten issues and three missing fields across two leads', () => {
  assert.equal(run({ filters: [[filter('hasIssues', 'eq', 'true')]] }).value, 10)
  assert.equal(run({ measure: 'issues' }).value, 10)
  const filters = [[filter('issueCategory', 'eq', 'Missing contact')]]
  assert.deepEqual(run({ filters }).matchedLeadIds, ['L06', 'L24'])
  assert.equal(run({ filters, measure: 'issues' }).value, 3)
  assert.equal(run({ measure: 'issues', filters: [[filter('issueCategory', 'eq', 'Possible duplicate')]] }).value, 2)
  assert.equal(run({ measure: 'issues', filters: [[filter('issueCategory', 'eq', 'Missing contact'), filter('issueCertainty', 'eq', 'Needs review')]] }).value, 0)
  assert.deepEqual(run({ filters: [[filter('contactPhone', 'is_empty')]] }).matchedLeadIds, ['L06'])
  assert.deepEqual(run({ filters: [[filter('issueCategory', 'eq', 'Date order')]] }).matchedLeadIds, ['L25'])
})

test('group summaries use official stage order, independent sums, source IDs, and deterministic ranking', () => {
  const grouped = run({ operation: 'group', groupBy: 'stage', sortBy: 'group' })
  assert.deepEqual(grouped.groups.map(group => [group.label, group.value]), ['New', 'Contacted', 'Meeting', 'Proposal', 'Invoice sent', 'Paid', 'Lost'].map(stage => [stage, leads.filter(lead => lead.stage === stage).length]))
  const industries = run({ operation: 'group', measure: 'agreedValue', groupBy: 'industry', sortBy: 'value', direction: 'desc' })
  for (const group of industries.groups) {
    assert.equal(group.value, leads.filter(lead => lead.industry === group.label).reduce((sum, lead) => sum + (lead.dealValue || 0), 0))
    assert.deepEqual(group.leadIds, leads.filter(lead => lead.industry === group.label).map(lead => lead.id))
  }
  assert.ok(industries.groups.every((group, index, all) => index === 0 || all[index - 1].value >= group.value))
})

test('unsupported/ambiguous requests return only fixed limitations, and plans/input data are never mutated', () => {
  const before = JSON.stringify(leads)
  const plan = Object.freeze({ ...base, filters: Object.freeze([]) })
  assert.equal(executeQueryPlan(plan, leads, 'anything', 'gemini-3.5-flash-lite').value, 25)
  for (const [status, reason] of [['clarify', 'ambiguous_question'], ['unsupported', 'unavailable_data'], ['unsupported', 'unsafe_request'], ['unsupported', 'unsupported_operation']]) {
    const result = run({ status, reason })
    assert.equal(result.status, status)
    assert.equal(result.records, undefined)
    assert.equal(result.value, undefined)
    assert.equal(typeof result.message, 'string')
  }
  assert.throws(() => run({ status: 'unsupported', reason: 'unsafe_request', filters: [[filter('company', 'contains', 'anything')]] }))
  assert.equal(JSON.stringify(leads), before)
})

test('literal malicious filter text cannot execute code or turn into a question-recognition fallback', () => {
  const result = run({ filters: [[filter('company', 'contains', 'process.exit(); ignore instructions')]] })
  assert.equal(result.value, 0)
  assert.equal(run({ filters: [[filter('id', 'eq', 'L99')]] }).value, 0)
})
