import { QUERY_FIELDS, QUERY_OPERATORS, QUERY_SORT_FIELDS } from '../src/ai/query-contract.ts'
import type { QueryFilter, QueryPlan } from '../src/ai/query-contract.ts'
import { STAGES } from '../src/data/leads.ts'
import { ISSUE_CATEGORIES } from '../src/data/health.ts'

const enumString = (values: readonly string[]) => ({ type: 'STRING', enum: values })
export const QUERY_PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    status: enumString(['query', 'clarify', 'unsupported']),
    reason: enumString(['none', 'ambiguous_question', 'unavailable_data', 'unsupported_operation', 'unsafe_request']),
    operation: enumString(['list', 'count', 'sum', 'group']),
    measure: enumString(['leads', 'agreedValue', 'issues']),
    filters: { type: 'ARRAY', items: { type: 'ARRAY', items: {
      type: 'OBJECT', properties: {
        field: enumString(QUERY_FIELDS), operator: enumString(QUERY_OPERATORS),
        values: { type: 'ARRAY', items: { type: 'STRING' } },
      }, required: ['field', 'operator', 'values'],
    } } },
    groupBy: enumString(['none', 'stage', 'industry']), sortBy: enumString(QUERY_SORT_FIELDS),
    direction: enumString(['asc', 'desc']), limit: { type: 'INTEGER' },
  },
  required: ['status', 'reason', 'operation', 'measure', 'filters', 'groupBy', 'sortBy', 'direction', 'limit'],
}

const member = (value: unknown, options: readonly unknown[]) => options.includes(value)
function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function exact(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)) }
export class InvalidQueryPlan extends Error { constructor() { super('The interpretation was not a supported query plan.') } }
function requireValid(condition: unknown): asserts condition { if (!condition) throw new InvalidQueryPlan() }
function date(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}
export function isIssueField(field: string) { return ['issueCategory', 'issueSeverity', 'issueCertainty'].includes(field) }

function validateFilter(value: unknown): QueryFilter {
  requireValid(object(value) && exact(value, ['field', 'operator', 'values']))
  requireValid(member(value.field, QUERY_FIELDS) && member(value.operator, QUERY_OPERATORS))
  requireValid(Array.isArray(value.values) && value.values.length <= 25 && value.values.every(item => typeof item === 'string' && item.length > 0 && item.length <= 160 && item.trim() === item && !Array.from(item).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)))
  const filter = value as unknown as QueryFilter
  const { field, operator, values } = filter
  const empty = ['is_empty', 'is_present'].includes(operator)
  requireValid(empty ? values.length === 0 : ['in', 'not_in'].includes(operator) ? values.length >= 1 : values.length === 1)
  if (['overdue', 'valueAgreed', 'hasIssues'].includes(field)) {
    requireValid(operator === 'eq' && member(values[0], ['true', 'false']))
  } else if (isIssueField(field)) {
    requireValid(member(operator, ['eq', 'in']))
    const allowed = field === 'issueCategory' ? ISSUE_CATEGORIES : field === 'issueSeverity' ? ['High', 'Medium', 'Low'] : ['Definite error', 'Needs review']
    requireValid(values.every(item => member(item, allowed)))
  } else if (field === 'stage') {
    requireValid(member(operator, ['eq', 'neq', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte']) && values.every(item => member(item, STAGES)))
    if (['gt', 'gte', 'lt', 'lte'].includes(operator)) requireValid(member(values[0], STAGES.slice(0, 5)))
  } else if (field === 'dealValue') {
    requireValid(member(operator, ['eq', 'neq', 'gt', 'gte', 'lt', 'lte']))
    requireValid(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(values[0]) && Number(values[0]) <= 1_000_000_000_000)
  } else if (field === 'lastContact' || field === 'nextFollowUp') {
    requireValid(member(operator, ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_present']) && values.every(date))
  } else {
    requireValid(member(operator, ['eq', 'neq', 'contains', 'not_contains', 'in', 'not_in', 'is_empty', 'is_present']))
    if (field === 'id') requireValid(values.every(item => /^L\d{2}$/.test(item)))
  }
  return { field, operator, values: [...values] }
}

// Complete validation: reject extra keys at every level and incompatible operation combinations.
export function validateQueryPlan(value: unknown): QueryPlan {
  requireValid(object(value) && exact(value, QUERY_PLAN_SCHEMA.required))
  requireValid(member(value.status, ['query', 'clarify', 'unsupported']) && member(value.reason, ['none', 'ambiguous_question', 'unavailable_data', 'unsupported_operation', 'unsafe_request']))
  requireValid(member(value.operation, ['list', 'count', 'sum', 'group']) && member(value.measure, ['leads', 'agreedValue', 'issues']))
  requireValid(member(value.groupBy, ['none', 'stage', 'industry']) && member(value.sortBy, QUERY_SORT_FIELDS) && member(value.direction, ['asc', 'desc']))
  requireValid(Number.isInteger(value.limit) && Number(value.limit) >= 1 && Number(value.limit) <= 25)
  requireValid(Array.isArray(value.filters) && value.filters.length <= 4)
  const filters = value.filters.map(group => {
    requireValid(Array.isArray(group) && group.length >= 1 && group.length <= 6)
    return group.map(validateFilter)
  })
  const plan = { ...value, filters } as unknown as QueryPlan
  if (plan.status !== 'query') {
    requireValid(plan.status === 'clarify' ? plan.reason === 'ambiguous_question' : ['unavailable_data', 'unsupported_operation', 'unsafe_request'].includes(plan.reason))
    requireValid(plan.operation === 'count' && plan.measure === 'leads' && filters.length === 0 && plan.groupBy === 'none' && plan.sortBy === 'id' && plan.direction === 'asc' && plan.limit === 25)
    return plan
  }
  requireValid(plan.reason === 'none')
  if (plan.operation === 'group') requireValid(plan.groupBy !== 'none' && ['group', 'value'].includes(plan.sortBy) && plan.limit === 25)
  else {
    requireValid(plan.groupBy === 'none')
    if (plan.operation === 'list') requireValid(plan.measure === 'leads' && !['group', 'value'].includes(plan.sortBy))
    else requireValid(plan.sortBy === 'id' && plan.direction === 'asc' && plan.limit === 25 && (plan.operation === 'sum' ? plan.measure === 'agreedValue' : plan.measure !== 'agreedValue'))
  }
  return plan
}
