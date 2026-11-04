// Browser contract only: never import server modules or environment settings.
export const SOURCE_FIELD_LABELS = {
  company: 'Company', contactName: 'Contact name', contactRole: 'Contact role', stage: 'Pipeline stage', notes: 'Source notes',
} as const
export type SourceField = keyof typeof SOURCE_FIELD_LABELS
export interface EmailDraft {
  subject: string
  body: string
  leadId: string
  sourceFields: SourceField[]
  model: string
  draftOnly: true
}

const ERROR_MESSAGES: Record<string, string> = {
  MODEL_UNAVAILABLE: 'The AI model is unavailable. Ask the app owner to check model access before trying again.',
  PROVIDER_FAILURE: 'The AI service could not complete this request. Try again later; no automatic retry was made.',
  PROVIDER_REQUEST_REJECTED: 'The AI service rejected the request configuration. Ask the app owner to check the server settings.',
  PROVIDER_TIMEOUT: 'Draft generation timed out. The provider may still have processed the request. Wait before trying again.',
  REQUEST_TIMEOUT: 'The draft request timed out. Check your connection before trying again.',
  RATE_LIMITED: 'Too many draft requests. Wait before generating another draft.',
  PROVIDER_QUOTA_EXCEEDED: 'The AI service quota or rate limit has been reached. Ask the app owner to check availability.',
  AI_NOT_CONFIGURED: 'AI drafting is not configured. Ask the app owner to configure the server.',
  MODEL_NOT_CONFIGURED: 'The AI model setting is not configured correctly. Ask the app owner to check the server.',
  ACCESS_NOT_CONFIGURED: 'Secure browser access is not configured for this deployment. Use the local development app.',
  UNAUTHORIZED: 'Your current session does not authorize drafting. Sign in again to generate a draft.',
  ORIGIN_REJECTED: 'Open DealDesk directly on its own site to generate a draft.',
  LOCAL_ACCESS_ONLY: 'Drafting is available only through the local development app on this computer.',
  PROVIDER_ACCESS_DENIED: 'The AI service denied access. Ask the app owner to check provider access.',
  LEAD_NOT_FOUND: 'This lead could not be found on the server. Reload the app to check the source records.',
  SOURCE_UNAVAILABLE: 'The server could not load the source leads. Ask the app owner to check the source file.',
  SOURCE_TOO_LARGE: 'The source context exceeds the drafting limit. Ask the app owner to review the record.',
  INVALID_REQUEST: 'The draft request was not accepted. Reload the app before trying again.',
  INVALID_PROVIDER_RESPONSE: 'No usable draft was returned. Review the lead context and try again later.',
  NETWORK_ERROR: 'The app could not reach the drafting service. Check your connection. No automatic retry was made.',
}

export class DraftRequestError extends Error {
  readonly code: string
  constructor(code: string) {
    super(Object.hasOwn(ERROR_MESSAGES, code) ? ERROR_MESSAGES[code] : 'The draft request could not be completed. Contact the app owner if this continues.')
    this.code = Object.hasOwn(ERROR_MESSAGES, code) ? code : 'UNKNOWN_ERROR'
  }
}

export function canDraftLocally(development: boolean, hostname: string): boolean {
  // UI availability only; the server still enforces authorization.
  return development && ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseDraft(value: unknown, leadId: string): EmailDraft {
  if (!object(value) || value.leadId !== leadId || value.draftOnly !== true ||
    typeof value.subject !== 'string' || !value.subject.trim() || value.subject.length > 120 || /[\r\n]/.test(value.subject) ||
    typeof value.body !== 'string' || !value.body.trim() || value.body.length > 1800 ||
    typeof value.model !== 'string' || !/^gemini-[a-z0-9.-]{1,80}$/.test(value.model) ||
    !Array.isArray(value.sourceFields) || value.sourceFields.length === 0 ||
    !value.sourceFields.every((field) => typeof field === 'string' && Object.hasOwn(SOURCE_FIELD_LABELS, field)) ||
    new Set(value.sourceFields).size !== value.sourceFields.length) {
    throw new DraftRequestError('INVALID_PROVIDER_RESPONSE')
  }
  return { subject: value.subject, body: value.body, leadId, sourceFields: value.sourceFields as SourceField[], model: value.model, draftOnly: true }
}

export async function requestDraft(leadId: string, options: {
  fetchImpl?: typeof fetch; signal?: AbortSignal; timeoutMs?: number
} = {}): Promise<EmailDraft> {
  if (!/^L\d{2}$/.test(leadId)) throw new DraftRequestError('INVALID_REQUEST')
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), options.timeoutMs ?? 25_000)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal
  try {
    const response = await (options.fetchImpl ?? fetch)('/api/ai/draft', {
      method: 'POST', mode: 'same-origin', credentials: 'same-origin', redirect: 'error',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId }), signal,
    })
    let value: unknown
    try { value = await response.json() } catch {
      throw new DraftRequestError(response.ok ? 'INVALID_PROVIDER_RESPONSE' : 'PROVIDER_FAILURE')
    }
    if (!response.ok) {
      const code = object(value) && object(value.error) && typeof value.error.code === 'string' ? value.error.code : 'UNKNOWN_ERROR'
      throw new DraftRequestError(code)
    }
    return parseDraft(value, leadId)
  } catch (error) {
    if (timeout.signal.aborted) throw new DraftRequestError('PROVIDER_TIMEOUT')
    if (options.signal?.aborted) throw new DraftRequestError('REQUEST_TIMEOUT')
    if (error instanceof DraftRequestError) throw error
    throw new DraftRequestError('NETWORK_ERROR')
  } finally { clearTimeout(timer) }
}

export function formatEmail(draft: Pick<EmailDraft, 'subject' | 'body'>): string {
  return `Subject: ${draft.subject}\n\n${draft.body}`
}
