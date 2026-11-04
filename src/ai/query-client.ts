import type { QueryResponse } from './query-contract'
import { STAGES } from '../data/leads.ts'

const messages: Record<string, string> = {
  MODEL_UNAVAILABLE: 'The Gemini model is unavailable. Ask the app owner to check access.',
  PROVIDER_FAILURE: 'Gemini could not interpret the question. Try again later; no automatic retry was made.',
  PROVIDER_REQUEST_REJECTED: 'Gemini rejected the query configuration. Ask the app owner to check the server.',
  INVALID_QUERY_PLAN: 'Gemini returned an interpretation that could not be safely validated. No answer was calculated. Try rephrasing the question.',
  PROVIDER_TIMEOUT: 'Interpretation timed out. Wait before trying again; the provider may still have processed the request.',
  REQUEST_TIMEOUT: 'The question request timed out or was cancelled. No automatic retry was made.',
  RATE_LIMITED: 'Too many question requests. Wait before asking again.',
  PROVIDER_QUOTA_EXCEEDED: 'The Gemini quota or rate limit was reached. Ask the app owner to check availability.',
  AI_NOT_CONFIGURED: 'Gemini interpretation is not configured. Ask the app owner to configure the server.',
  MODEL_NOT_CONFIGURED: 'The server model setting is unsupported. Contact the app owner.',
  ACCESS_NOT_CONFIGURED: 'Secure browser access is not configured. Use the local development app.',
  UNAUTHORIZED: 'This deployment does not authorize browser queries. Use the local development app.',
  LOCAL_ACCESS_ONLY: 'Queries are available through the local development app on this computer.',
  PROVIDER_ACCESS_DENIED: 'Gemini access was denied. Ask the app owner to check provider access.',
  INVALID_REQUEST: 'Enter a question of up to 800 characters.',
  SOURCE_UNAVAILABLE: 'The source records could not be loaded. Contact the app owner.',
  NETWORK_ERROR: 'The app could not reach the query service. Check your connection; no automatic retry was made.',
  INVALID_RESPONSE: 'The query service returned an unusable response. No answer can be shown.',
}
export class QueryRequestError extends Error {
  constructor(code: string) { super(Object.hasOwn(messages, code) ? messages[code] : 'The question could not be completed. Contact the app owner if this continues.') }
}
function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')
const ids = (value: unknown): value is string[] => strings(value) && value.length <= 25 && new Set(value).size === value.length && value.every(id => /^L\d{2}$/.test(id))
function validResponse(value: unknown, question: string): value is QueryResponse {
  if (!object(value) || value.question !== question) return false
  if (value.status === 'clarify' || value.status === 'unsupported') return typeof value.message === 'string' && value.message.length > 0
  if (value.status !== 'answer' || typeof value.answer !== 'string' || typeof value.model !== 'string' || value.referenceDate !== '2026-11-01' || value.sourceCount !== 25 ||
    !strings(value.criteria) || !strings(value.warnings) || !ids(value.matchedLeadIds) || !ids(value.displayedLeadIds) || !strings(value.issueIds) ||
    !object(value.plan) || !['list', 'count', 'sum', 'group'].includes(String(value.plan.operation)) || !['leads', 'issues', 'agreedValue'].includes(String(value.plan.measure)) ||
    !(value.value === null || (typeof value.value === 'number' && Number.isFinite(value.value) && value.value >= 0)) || !Array.isArray(value.records) || !Array.isArray(value.groups)) return false
  const matchedIds = value.matchedLeadIds
  if (!value.displayedLeadIds.every(id => matchedIds.includes(id)) || value.records.length !== matchedIds.length) return false
  const textFields = ['id', 'company', 'industry', 'contactName', 'contactRole', 'contactEmail', 'contactPhone', 'source', 'stage', 'lastContact', 'nextFollowUp', 'notes']
  if (!value.records.every(record => object(record) && textFields.every(field => typeof record[field] === 'string') && matchedIds.includes(String(record.id)) && STAGES.some(stage => stage === record.stage) && (record.dealValue === null || (typeof record.dealValue === 'number' && Number.isFinite(record.dealValue) && record.dealValue >= 0)))) return false
  if (new Set(value.records.map(record => record.id)).size !== matchedIds.length) return false
  return value.groups.every(group => object(group) && typeof group.label === 'string' && typeof group.value === 'number' && Number.isFinite(group.value) && group.value >= 0 && ids(group.leadIds) && group.leadIds.every(id => matchedIds.includes(id)) && strings(group.issueIds))
}
export async function requestQuery(question: string, options: { fetchImpl?: typeof fetch; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<QueryResponse> {
  if (!question.trim() || question.length > 800) throw new QueryRequestError('INVALID_REQUEST')
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), options.timeoutMs ?? 25_000)
  try {
    const response = await (options.fetchImpl ?? fetch)('/api/ai/query', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, mode: 'same-origin', credentials: 'same-origin', redirect: 'error',
      body: JSON.stringify({ question: question.trim() }), signal: options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal,
    })
    let value: unknown
    try { value = await response.json() } catch { throw new QueryRequestError('INVALID_RESPONSE') }
    if (!response.ok) throw new QueryRequestError(object(value) && object(value.error) && typeof value.error.code === 'string' ? value.error.code : 'UNKNOWN_ERROR')
    if (!validResponse(value, question.trim())) throw new QueryRequestError('INVALID_RESPONSE')
    return value
  } catch (error) {
    if (timeout.signal.aborted) throw new QueryRequestError('PROVIDER_TIMEOUT')
    if (options.signal?.aborted) throw new QueryRequestError('REQUEST_TIMEOUT')
    if (error instanceof QueryRequestError) throw error
    throw new QueryRequestError('NETWORK_ERROR')
  } finally { clearTimeout(timer) }
}
