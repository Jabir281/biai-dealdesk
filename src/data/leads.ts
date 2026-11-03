export const REFERENCE_DATE = '2026-11-01'
export const STAGES = ['New', 'Contacted', 'Meeting', 'Proposal', 'Invoice sent', 'Paid', 'Lost'] as const
export type Stage = (typeof STAGES)[number]

export interface Lead {
  id: string
  company: string
  industry: string
  contactName: string
  contactRole: string
  contactEmail: string
  contactPhone: string
  source: string
  stage: Stage
  dealValue: number | null
  lastContact: string
  nextFollowUp: string
  notes: string
}

const HEADERS = ['lead id', 'company', 'industry', 'contact name', 'contact role',
  'contact email', 'contact phone', 'source', 'stage', 'deal value (BDT)',
  'last contact', 'next follow-up', 'notes']

// Preserve empty cells, quoted commas, escaped quotes and embedded newlines.
export function parseCsv(csv: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let quoteClosed = false
  const input = csv.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') { field += '"'; i++ }
        else { quoted = false; quoteClosed = true }
      } else field += char
    } else if (char === ',' || char === '\n') {
      row.push(field)
      field = ''
      quoteClosed = false
      if (char === '\n') { rows.push(row); row = [] }
    } else if (char === '"' && field === '' && !quoteClosed) {
      quoted = true
    } else {
      if (quoteClosed || char === '"') throw new Error('Invalid CSV quoting.')
      field += char
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote.')
  if (field !== '' || row.length > 0 || quoteClosed) rows.push([...row, field])
  return rows
}

function isStage(value: string): value is Stage {
  return STAGES.some((stage) => stage === value)
}

function isDateOrEmpty(value: string): boolean {
  if (value === '') return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

export function parseLeads(csv: string): Lead[] {
  const [headers, ...rows] = parseCsv(csv)
  if (!headers || headers.length !== HEADERS.length || headers.some((header, i) => header !== HEADERS[i])) {
    throw new Error('The lead CSV headers do not match the expected source format.')
  }
  const ids = new Set<string>()
  return rows.map((row, index) => {
    if (row.length !== HEADERS.length) throw new Error(`CSV row ${index + 2} has an unexpected number of fields.`)
    const [id, company, industry, contactName, contactRole, contactEmail,
      contactPhone, source, stage, value, lastContact, nextFollowUp, notes] = row
    if (!id || ids.has(id)) throw new Error(`CSV row ${index + 2} has a missing or repeated lead ID.`)
    ids.add(id)
    if (!isStage(stage)) throw new Error(`Unknown stage for ${id}: ${stage}`)
    const dealValue = value.trim() === '' ? null : Number(value)
    if (dealValue !== null && (!Number.isFinite(dealValue) || dealValue < 0)) throw new Error(`Invalid deal value for ${id}.`)
    if (!isDateOrEmpty(lastContact) || !isDateOrEmpty(nextFollowUp)) throw new Error(`Invalid date format for ${id}.`)
    return { id, company, industry, contactName, contactRole, contactEmail,
      contactPhone, source, stage, dealValue, lastContact, nextFollowUp, notes }
  })
}

export function isOverdue(lead: Lead): boolean {
  // Validated ISO dates sort chronologically; no wall clock or timezone dependence.
  return lead.nextFollowUp !== '' && lead.nextFollowUp < REFERENCE_DATE
}

export interface LeadFilters {
  search: string
  stage: Stage | 'All stages'
  overdueOnly: boolean
}

export function filterLeads(leads: Lead[], filters: LeadFilters): Lead[] {
  const query = filters.search.trim().toLowerCase()
  return leads.filter((lead) =>
    [lead.id, lead.company, lead.contactName, lead.contactEmail, lead.contactPhone]
      .some((value) => value.toLowerCase().includes(query)) &&
    (filters.stage === 'All stages' || lead.stage === filters.stage) &&
    (!filters.overdueOnly || isOverdue(lead)),
  )
}

export function duplicateIds(lead: Lead, leads: Lead[]): string[] {
  const normalize = (value: string) => value.trim().toLowerCase()
  return leads.filter((other) => other.id !== lead.id && (
    normalize(other.company) === normalize(lead.company) ||
    (lead.contactEmail !== '' && normalize(other.contactEmail) === normalize(lead.contactEmail))
  )).map((other) => other.id)
}

export function formatDealValue(value: number | null): string {
  return value === null || value === 0 ? 'Not agreed' : new Intl.NumberFormat('en-BD').format(value)
}

export function formatDate(value: string): string {
  return value === '' ? 'Not scheduled' : new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}
