import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { duplicateIds, filterLeads, formatDealValue, isOverdue, parseCsv, parseLeads, STAGES } from '../src/data/leads.ts'

const csv = readFileSync(new URL('../src/data/corporate-leads.csv', import.meta.url), 'utf8')
const leads = parseLeads(csv)
const byId = (id) => leads.find((lead) => lead.id === id)
const ids = (rows) => rows.map((lead) => lead.id)
const filters = { search: '', stage: 'All stages', overdueOnly: false }

test('all 25 original records and quoted/empty fields are retained', () => {
  assert.equal(leads.length, 25)
  assert.deepEqual(ids(leads), Array.from({ length: 25 }, (_, i) => `L${String(i + 1).padStart(2, '0')}`))
  assert.equal(byId('L10').contactRole, 'Senior Manager, Training')
  assert.equal(byId('L07').notes, 'Invoice sent, waiting for payment. Ask whether the advance has come in.')
  assert.equal(byId('L24').contactName, '')
  assert.equal(byId('L24').contactRole, '')
  assert.equal(byId('L24').contactEmail, '')
  assert.equal(byId('L24').contactPhone, '01555-200124')
  assert.equal(byId('L06').contactPhone, '')
})

test('overdue set is exact and uses the fixed reference date', () => {
  assert.deepEqual(ids(leads.filter(isOverdue)), ['L04', 'L06', 'L10', 'L13', 'L15', 'L19', 'L20', 'L22', 'L25'])
  assert.equal(isOverdue(byId('L09')), false)
  assert.equal(isOverdue(byId('L08')), false)
  assert.equal(byId('L25').nextFollowUp, '2026-10-21')
  assert.equal(byId('L25').lastContact, '2026-10-28')
})

test('duplicate candidates are retained and linked in both directions', () => {
  for (const [a, b] of [['L01', 'L23'], ['L02', 'L03']]) {
    assert.deepEqual(duplicateIds(byId(a), leads), [b])
    assert.deepEqual(duplicateIds(byId(b), leads), [a])
  }
})

test('company/contact search and intersecting filters return expected source IDs', () => {
  assert.deepEqual(ids(filterLeads(leads, { ...filters, search: '  PADMA  ' })), ['L01', 'L23'])
  assert.deepEqual(ids(filterLeads(leads, { ...filters, search: 'sultana' })), ['L02', 'L03'])
  assert.deepEqual(ids(filterLeads(leads, { ...filters, search: 'sultana@meghna-pharma.example' })), ['L02', 'L03'])
  assert.deepEqual(ids(filterLeads(leads, { ...filters, search: '01555-200124' })), ['L24'])
  assert.deepEqual(ids(filterLeads(leads, { ...filters, stage: 'Meeting', overdueOnly: true })), ['L10', 'L19'])
  assert.deepEqual(ids(filterLeads(leads, { ...filters, search: 'oriental', stage: 'Meeting', overdueOnly: true })), ['L10'])
  assert.deepEqual(filterLeads(leads, { ...filters, stage: 'Paid', overdueOnly: true }), [])
  assert.deepEqual(filterLeads(leads, { ...filters, search: 'no matching lead' }), [])
  assert.equal(filterLeads(leads, filters).length, 25)
})

test('official stage order and stage counts match the source', () => {
  assert.deepEqual(STAGES, ['New', 'Contacted', 'Meeting', 'Proposal', 'Invoice sent', 'Paid', 'Lost'])
  assert.deepEqual(STAGES.map((stage) => filterLeads(leads, { ...filters, stage }).length), [3, 8, 6, 3, 2, 1, 2])
})

test('zero and empty values stay distinct in data but both display Not agreed', () => {
  assert.equal(byId('L04').dealValue, 0)
  const emptyValueCsv = csv.replace('Contacted,0,2026-10-20', 'Contacted,,2026-10-20')
  assert.equal(parseLeads(emptyValueCsv).find((lead) => lead.id === 'L04').dealValue, null)
  assert.equal(formatDealValue(0), 'Not agreed')
  assert.equal(formatDealValue(null), 'Not agreed')
  assert.equal(formatDealValue(350000), '350,000')
})

test('CSV handles escaped quotes, newlines, BOM, CRLF and trailing empty cells', () => {
  assert.deepEqual(parseCsv('\uFEFFa,b,c\r\n"one, two","say ""hello""\r\nagain",\r\n'), [
    ['a', 'b', 'c'], ['one, two', 'say "hello"\nagain', ''],
  ])
  assert.deepEqual(parseCsv('a,b\n1,'), [['a', 'b'], ['1', '']])
  assert.throws(() => parseCsv('"unclosed'), /Unclosed/)
  assert.throws(() => parseCsv('"closed"extra'), /Invalid/)
  assert.throws(() => parseLeads(csv.replace('Invoice sent,250000', 'Unknown,250000')), /Unknown stage/)
  assert.throws(() => parseLeads(csv.replace('2026-10-24', '2026-02-30')), /Invalid date/)
})
