import type { Lead } from './leads.ts'

export const ISSUE_CATEGORIES = [
  'Missing contact', 'Possible duplicate', 'Date order', 'Field / note conflict', 'Email verification',
] as const
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number]
export type IssueSeverity = 'High' | 'Medium' | 'Low'
export type IssueCertainty = 'Definite error' | 'Needs review'

export interface HealthIssue {
  readonly id: string
  readonly category: IssueCategory
  readonly severity: IssueSeverity
  readonly certainty: IssueCertainty
  readonly title: string
  readonly leadIds: readonly string[]
  readonly evidence: readonly string[]
  readonly action: string
}

type SourceLead = Readonly<Lead>

export function validateMissingContact(lead: SourceLead): HealthIssue[] {
  // These three fields are this audit's completeness baseline; role is optional.
  const fields = [
    ['contactName', 'Contact name'], ['contactEmail', 'Email address'], ['contactPhone', 'Phone number'],
  ] as const
  return fields.filter(([key]) => lead[key].trim() === '').map(([key, label]) => ({
    id: `missing-${key}-${lead.id}`,
    category: 'Missing contact', severity: 'Medium', certainty: 'Definite error',
    title: `${label} missing`, leadIds: [lead.id],
    evidence: [`${label} is empty in the source record.`],
    action: `Ask the lead owner to verify and record the ${label.toLowerCase()}. Do not infer it from the company name or notes.`,
  }))
}

export function normalizeCompany(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim().replace(/(?:\s+(?:ltd|limited))+$/, '').trim()
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '').replace(/^00880/, '880')
  // Bangladesh mobile country-code form and local form refer to the same number.
  return /^8801\d{9}$/.test(digits) ? `0${digits.slice(3)}` : digits
}

export function findDuplicateIssues(leads: readonly SourceLead[]): HealthIssue[] {
  const issues: HealthIssue[] = []
  for (let i = 0; i < leads.length; i++) {
    for (let j = i + 1; j < leads.length; j++) {
      const a = leads[i]
      const b = leads[j]
      const comparisons = [
        { label: 'email', left: a.contactEmail, right: b.contactEmail, normalize: (s: string) => s.trim().toLowerCase() },
        { label: 'phone', left: a.contactPhone, right: b.contactPhone, normalize: normalizePhone },
        { label: 'company name', left: a.company, right: b.company, normalize: normalizeCompany },
      ]
      const evidence = comparisons.filter(({ left, right, normalize }) =>
        normalize(left) !== '' && normalize(left) === normalize(right),
      ).map(({ label, left, right, normalize }) =>
        `Shared normalized ${label}: “${normalize(left)}”. ${a.id}: “${left}”; ${b.id}: “${right}”.`,
      )
      if (evidence.length > 0) issues.push({
        id: `duplicate-${[a.id, b.id].sort().join('-')}`,
        category: 'Possible duplicate', severity: 'Medium', certainty: 'Needs review',
        title: 'Likely duplicate records', leadIds: [a.id, b.id], evidence,
        action: 'Compare both original records with the lead owner. Shared contacts can serve multiple companies; confirm the relationship before deciding whether to consolidate. Keep both IDs for review.',
      })
    }
  }
  return issues
}

export function validateDateOrder(lead: SourceLead): HealthIssue[] {
  // parseLeads already validates ISO dates. Missing dates are not sequence errors.
  if (!lead.lastContact || !lead.nextFollowUp || lead.nextFollowUp >= lead.lastContact) return []
  return [{
    id: `date-order-${lead.id}`, category: 'Date order', severity: 'High', certainty: 'Definite error',
    title: 'Follow-up precedes last contact', leadIds: [lead.id],
    evidence: [`Next follow-up ${lead.nextFollowUp} is earlier than last contact ${lead.lastContact}.`],
    action: 'Check the contact history and confirm the intended follow-up date with the owner. Neither date has been corrected automatically.',
  }]
}

export function validateNoteEvidence(lead: SourceLead): HealthIssue[] {
  const issues: HealthIssue[] = []
  // Deliberately narrow, explicit sentence patterns from the supplied dataset.
  // These identify disagreement, not which version is true or current.
  const noContact = /(?:^|[.!]\s+)No phone or email on file yet[.!](?:\s|$)/i.test(lead.notes)
  if (noContact && (lead.contactEmail.trim() || lead.contactPhone.trim())) {
    const populated = [
      lead.contactEmail.trim() ? `Email field: “${lead.contactEmail}”.` : '',
      lead.contactPhone.trim() ? `Phone field: “${lead.contactPhone}”.` : '',
    ].filter(Boolean)
    issues.push({
      id: `contact-note-${lead.id}`, category: 'Field / note conflict', severity: 'Medium', certainty: 'Needs review',
      title: 'Contact fields disagree with notes', leadIds: [lead.id],
      evidence: [...populated, `Source notes: “${lead.notes}”`],
      action: 'Verify the populated contact details and whether the note is outdated. Do not erase a field just because the note says it is missing.',
    })
  }

  const advance = lead.notes.match(/(?:^|[.!]\s+)Paid\s+(\d+(?:\.\d+)?)\s*(?:percent|%)\s+advance[.!](?:\s|$)/i)
  const paymentStillDue = /\bthe second payment is due\./i.test(lead.notes)
  if (lead.stage === 'Paid' && advance && Number(advance[1]) > 0 && Number(advance[1]) < 100 && paymentStillDue) {
    issues.push({
      id: `payment-note-${lead.id}`, category: 'Field / note conflict', severity: 'High', certainty: 'Needs review',
      title: 'Paid stage disagrees with payment notes', leadIds: [lead.id],
      evidence: ['Structured stage: Paid. The official stage definition requires the full amount received.', `Source notes: “${lead.notes}”`],
      action: 'Check the payment ledger with the owner. Confirm whether the stage or the note is outdated before changing either.',
    })
  }

  const sentProposal = /(?:^|[.!]\s+)(?:Price list|Proposal) (?:was )?sent[.!](?:\s|$)/i.test(lead.notes)
  if (sentProposal && (lead.stage === 'New' || lead.stage === 'Contacted' || lead.stage === 'Meeting')) {
    issues.push({
      id: `proposal-note-${lead.id}`, category: 'Field / note conflict', severity: 'Medium', certainty: 'Needs review',
      title: 'Stage disagrees with a sent price list or proposal', leadIds: [lead.id],
      evidence: [`Structured stage: ${lead.stage}. The official Proposal definition includes a written proposal or price list sent.`, `Source notes: “${lead.notes}”`],
      action: 'Confirm that the price list or proposal was actually sent and whether this is the current opportunity. Review the stage and note together.',
    })
  }

  if (lead.contactEmail.trim() && /(?:^|[.!]\s+)Email has a typo\b/i.test(lead.notes)) {
    issues.push({
      id: `email-verification-${lead.id}`, category: 'Email verification', severity: 'Low', certainty: 'Needs review',
      title: 'Verify the email mentioned in notes', leadIds: [lead.id],
      evidence: [`Email field: “${lead.contactEmail}”.`, `Source notes: “${lead.notes}”`, 'The note raises a concern; capitalization alone does not establish an invalid address.'],
      action: 'Confirm the spelling with the contact or owner before using the email. Do not guess a replacement address.',
    })
  }
  return issues
}

export function auditLeads(leads: readonly SourceLead[]): HealthIssue[] {
  const issues = [
    ...leads.flatMap((lead) => [...validateMissingContact(lead), ...validateDateOrder(lead), ...validateNoteEvidence(lead)]),
    ...findDuplicateIssues(leads),
  ]
  const priority: Record<IssueSeverity, number> = { High: 0, Medium: 1, Low: 2 }
  return issues.sort((a, b) => priority[a.severity] - priority[b.severity] || a.leadIds[0].localeCompare(b.leadIds[0]) || a.id.localeCompare(b.id))
}

export function summarizeIssues(issues: readonly HealthIssue[]) {
  return {
    issueCount: issues.length,
    flaggedLeadIds: [...new Set(issues.flatMap((issue) => issue.leadIds))].sort(),
    definiteCount: issues.filter((issue) => issue.certainty === 'Definite error').length,
    reviewCount: issues.filter((issue) => issue.certainty === 'Needs review').length,
  }
}
