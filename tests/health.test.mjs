import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseLeads } from '../src/data/leads.ts'
import {
  auditLeads, findDuplicateIssues, normalizeCompany, summarizeIssues,
  validateDateOrder, validateMissingContact, validateNoteEvidence,
} from '../src/data/health.ts'

const leads = parseLeads(readFileSync(new URL('../src/data/corporate-leads.csv', import.meta.url), 'utf8'))
const byId = (id) => leads.find((lead) => lead.id === id)
const issues = auditLeads(leads)
const categoryIds = (category) => summarizeIssues(issues.filter((issue) => issue.category === category)).flaggedLeadIds

test('known duplicate pairs produce one review issue each with explicit matching evidence', () => {
  const duplicates = findDuplicateIssues(leads)
  assert.deepEqual(duplicates.map((issue) => issue.leadIds), [['L01', 'L23'], ['L02', 'L03']])
  assert.equal(duplicates[0].evidence.length, 3)
  assert.equal(duplicates[1].evidence.length, 2)
  assert.ok(duplicates.every((issue) => issue.certainty === 'Needs review'))
  assert.match(duplicates[0].evidence.join(' '), /Shared normalized company name/)
  assert.match(duplicates[1].evidence.join(' '), /sultana@meghna-pharma.example/)
})

test('duplicates use nonempty normalized company, email or phone independently', () => {
  const a = { ...byId('L01'), id: 'A', company: 'Example Training Ltd.', contactEmail: '', contactPhone: '' }
  const b = { ...a, id: 'B', company: '  EXAMPLE   TRAINING Limited ' }
  assert.equal(normalizeCompany(a.company), normalizeCompany(b.company))
  assert.equal(findDuplicateIssues([a, b]).length, 1)
  const unrelated = { ...b, company: 'Unrelated company' }
  assert.equal(findDuplicateIssues([a, unrelated]).length, 0)
  assert.equal(findDuplicateIssues([{ ...a, company: '', contactPhone: '---' }, { ...b, company: ' ', contactPhone: '' }]).length, 0)
  assert.equal(findDuplicateIssues([
    { ...a, contactEmail: '  Person@EXAMPLE.test ' }, { ...unrelated, contactEmail: 'person@example.test' },
  ]).length, 1)
  for (const phone of ['+880 1711 200101', '00880-1711-200101', '01711 200101']) {
    assert.equal(findDuplicateIssues([{ ...a, contactPhone: '01711-200101' }, { ...unrelated, contactPhone: phone }]).length, 1)
  }
})

test('matching chains remain distinct pairs and count each participating ID once', () => {
  const a = { ...byId('L01'), id: 'A', company: 'A', contactEmail: 'shared@example.test', contactPhone: '111' }
  const b = { ...a, id: 'B', company: 'B', contactPhone: '222' }
  const c = { ...b, id: 'C', company: 'C', contactEmail: 'other@example.test' }
  const result = findDuplicateIssues([a, b, c])
  assert.deepEqual(result.map((issue) => issue.leadIds), [['A', 'B'], ['B', 'C']])
  assert.deepEqual(summarizeIssues(result).flaggedLeadIds, ['A', 'B', 'C'])
})

test('missing contact fields are exact and role is explicitly optional', () => {
  assert.deepEqual(validateMissingContact(byId('L06')).map((issue) => issue.title), ['Phone number missing'])
  assert.deepEqual(validateMissingContact(byId('L24')).map((issue) => issue.title), ['Contact name missing', 'Email address missing'])
  assert.equal(validateMissingContact({ ...byId('L01'), contactRole: '' }).length, 0)
  assert.equal(validateMissingContact({ ...byId('L01'), contactPhone: '  ' }).length, 1)
  assert.deepEqual(categoryIds('Missing contact'), ['L06', 'L24'])
  assert.ok(issues.filter((issue) => issue.category === 'Missing contact').every((issue) => issue.certainty === 'Definite error'))
})

test('only L25 has a date-sequence error; empty and same-day dates are allowed', () => {
  assert.deepEqual(categoryIds('Date order'), ['L25'])
  const [issue] = validateDateOrder(byId('L25'))
  assert.equal(issue.certainty, 'Definite error')
  assert.match(issue.evidence[0], /2026-10-21.*2026-10-28/)
  for (const id of ['L09', 'L24', 'L08', 'L12']) assert.deepEqual(validateDateOrder(byId(id)), [])
  assert.deepEqual(validateDateOrder({ ...byId('L25'), nextFollowUp: '2026-10-28' }), [])
  assert.deepEqual(validateDateOrder({ ...byId('L25'), nextFollowUp: '2026-10-29' }), [])
})

test('contact contradiction quotes the populated email and original note without assuming truth', () => {
  const [issue] = validateNoteEvidence(byId('L06'))
  assert.equal(issue.category, 'Field / note conflict')
  assert.equal(issue.certainty, 'Needs review')
  assert.match(issue.evidence.join(' '), /imtiaz@sylhettea.example/)
  assert.ok(issue.evidence.includes(`Source notes: “${byId('L06').notes}”`))
  assert.deepEqual(validateNoteEvidence({ ...byId('L06'), contactEmail: '' }), [])
  assert.deepEqual(validateNoteEvidence({ ...byId('L06'), notes: 'No phone or email on file yet?' }), [])
})

test('Paid conflict requires explicit partial payment and outstanding payment evidence', () => {
  const [issue] = validateNoteEvidence(byId('L12'))
  assert.equal(issue.category, 'Field / note conflict')
  assert.equal(issue.severity, 'High')
  assert.equal(issue.certainty, 'Needs review')
  assert.ok(issue.evidence.includes(`Source notes: “${byId('L12').notes}”`))
  assert.deepEqual(validateNoteEvidence({ ...byId('L12'), stage: 'Invoice sent' }), [])
  assert.deepEqual(validateNoteEvidence({ ...byId('L12'), notes: 'Paid 100 percent advance. The second payment is due.' }), [])
  assert.deepEqual(validateNoteEvidence({ ...byId('L12'), notes: 'Paid 50 percent advance. The second payment is due?' }), [])
  assert.deepEqual(validateNoteEvidence({ ...byId('L12'), notes: 'Paid 50 percent advance. The remaining amount was received.' }), [])
})

test('sent-price-list conflict is supported by stage definitions; questions and requests do not trigger it', () => {
  const [issue] = validateNoteEvidence(byId('L20'))
  assert.equal(issue.category, 'Field / note conflict')
  assert.equal(issue.certainty, 'Needs review')
  assert.match(issue.evidence.join(' '), /Price list sent/)
  assert.deepEqual(validateNoteEvidence({ ...byId('L20'), stage: 'Proposal' }), [])
  for (const notes of ['Price list sent?', 'Price list not sent.', 'Asked for a price list.', 'Proposal was not sent.']) {
    assert.deepEqual(validateNoteEvidence({ ...byId('L20'), notes }), [])
  }
  assert.deepEqual(validateNoteEvidence(byId('L22')), [])
  assert.deepEqual(validateNoteEvidence(byId('L10')), [])
})

test('L18 is a verification request, never an invalid-email verdict', () => {
  const [issue] = validateNoteEvidence(byId('L18'))
  assert.equal(issue.category, 'Email verification')
  assert.equal(issue.certainty, 'Needs review')
  assert.equal(issue.severity, 'Low')
  assert.match(issue.evidence.join(' '), /capitalization alone does not establish an invalid address/)
  assert.deepEqual(validateNoteEvidence({ ...byId('L18'), notes: '' }), [])
  assert.equal(byId('L18').contactEmail, 'shahidul@bogurateXtile.example')
})

test('audit counts unique lead IDs separately from issue occurrences and duplicate pairs', () => {
  assert.deepEqual(summarizeIssues(issues), {
    issueCount: 10,
    flaggedLeadIds: ['L01', 'L02', 'L03', 'L06', 'L12', 'L18', 'L20', 'L23', 'L24', 'L25'],
    definiteCount: 4, reviewCount: 6,
  })
  const l06Issues = issues.filter((issue) => issue.leadIds.includes('L06'))
  assert.equal(summarizeIssues(l06Issues).issueCount, 2)
  assert.deepEqual(summarizeIssues(l06Issues).flaggedLeadIds, ['L06'])
  const pair = findDuplicateIssues(leads).slice(0, 1)
  assert.equal(summarizeIssues(pair).issueCount, 1)
  assert.deepEqual(summarizeIssues(pair).flaggedLeadIds, ['L01', 'L23'])
  assert.deepEqual(categoryIds('Field / note conflict'), ['L06', 'L12', 'L20'])
  assert.deepEqual(categoryIds('Email verification'), ['L18'])
  assert.equal(new Set(issues.map((issue) => issue.id)).size, issues.length)
})

test('validation is repeatable and does not mutate, drop or rewrite frozen source records', () => {
  const frozen = Object.freeze(leads.map((lead) => Object.freeze({ ...lead })))
  const before = JSON.stringify(frozen)
  assert.deepEqual(auditLeads(frozen), auditLeads(frozen))
  assert.equal(JSON.stringify(frozen), before)
  assert.equal(frozen.length, 25)
  assert.equal(frozen.find((lead) => lead.id === 'L25').nextFollowUp, '2026-10-21')
  assert.equal(frozen.find((lead) => lead.id === 'L12').stage, 'Paid')
  assert.equal(frozen.find((lead) => lead.id === 'L06').contactEmail, 'imtiaz@sylhettea.example')
  assert.deepEqual(summarizeIssues(auditLeads([])), { issueCount: 0, flaggedLeadIds: [], definiteCount: 0, reviewCount: 0 })
})
