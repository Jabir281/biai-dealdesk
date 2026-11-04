import type { Lead } from '../data/leads.ts'

export const QUERY_FIELDS = ['id', 'company', 'industry', 'contactName', 'contactRole', 'contactEmail', 'contactPhone', 'source', 'stage', 'dealValue', 'lastContact', 'nextFollowUp', 'overdue', 'valueAgreed', 'hasIssues', 'issueCategory', 'issueSeverity', 'issueCertainty'] as const
export const QUERY_OPERATORS = ['eq', 'neq', 'contains', 'not_contains', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_present'] as const
export const QUERY_SORT_FIELDS = ['id', 'company', 'contactName', 'industry', 'stage', 'dealValue', 'lastContact', 'nextFollowUp', 'group', 'value'] as const
export type QueryField = typeof QUERY_FIELDS[number]
export interface QueryFilter { field: QueryField; operator: typeof QUERY_OPERATORS[number]; values: string[] }
export interface QueryPlan {
  status: 'query' | 'clarify' | 'unsupported'
  reason: 'none' | 'ambiguous_question' | 'unavailable_data' | 'unsupported_operation' | 'unsafe_request'
  operation: 'list' | 'count' | 'sum' | 'group'
  measure: 'leads' | 'agreedValue' | 'issues'
  // OR between groups, AND within a group. [] means all records.
  filters: QueryFilter[][]
  groupBy: 'none' | 'stage' | 'industry'
  sortBy: typeof QUERY_SORT_FIELDS[number]
  direction: 'asc' | 'desc'
  limit: number
}
export interface QueryGroup { label: string; value: number; leadIds: string[]; issueIds: string[] }
export interface QueryAnswer {
  status: 'answer'
  question: string
  model: string
  referenceDate: string
  plan: QueryPlan
  answer: string
  criteria: string[]
  warnings: string[]
  sourceCount: number
  matchedLeadIds: string[]
  displayedLeadIds: string[]
  issueIds: string[]
  value: number | null
  groups: QueryGroup[]
  records: Lead[]
}
export interface QueryLimitation {
  status: 'clarify' | 'unsupported'
  question: string
  message: string
}
export type QueryResponse = QueryAnswer | QueryLimitation
