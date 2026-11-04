// Test artifacts only: fixed mocked interpretations, executed over the original records.
// This file is never imported by the app and makes no provider requests.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { executeQueryPlan } from '../../server/query-engine.ts'
import { loadSourceLeads } from '../../server/source-leads.ts'
const base = { status: 'query', reason: 'none', operation: 'count', measure: 'leads', filters: [], groupBy: 'none', sortBy: 'id', direction: 'asc', limit: 25 }
const cases = {
  overdue: ['I need the number of records whose next touchpoint is before November 1, 2026.', { filters: [[{ field: 'overdue', operator: 'eq', values: ['true'] }]] }],
  grouped: ['Compare the agreed BDT amounts at each stage, starting with the largest total.', { operation: 'group', measure: 'agreedValue', groupBy: 'stage', sortBy: 'value', direction: 'desc' }],
  list: ['Show the three smallest agreed deals.', { operation: 'list', sortBy: 'dealValue', limit: 3 }],
  empty: ['Do we have a company named Definitely Not In This Dataset?', { filters: [[{ field: 'company', operator: 'eq', values: ['Definitely Not In This Dataset'] }]] }],
  clarify: ['Which of those are better?', { status: 'clarify', reason: 'ambiguous_question' }],
  unsupported: ['What will their revenue be next year?', { status: 'unsupported', reason: 'unavailable_data' }],
}
const fixtures = Object.fromEntries(Object.entries(cases).map(([name, [question, changes]]) => [name, executeQueryPlan({ ...base, ...changes }, loadSourceLeads(), question, 'gemini-3.5-flash-lite')]))
mkdirSync('reports/query-screenshots', { recursive: true })
writeFileSync('reports/query-fixtures.json', JSON.stringify(fixtures), 'utf8')
writeFileSync('reports/query-browser-run.js', readFileSync('tests/browser/ask-pipeline.playwright.js', 'utf8').replace('/* TEST_FIXTURES */ null', JSON.stringify(fixtures)), 'utf8')
console.log('Wrote test-only query fixtures from the original records. No model requests.')
