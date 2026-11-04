import { boundedText, errorResponse, jsonResponse, SafeError } from './draft.ts'
import { equalSecret, issueSession, reviewerConfigured, sameOrigin, sessionCookie, sessionExpiry } from './reviewer-session.ts'
import type { ReviewerOptions } from './reviewer-session.ts'

export function createReviewerHandlers(options: ReviewerOptions & { bodyTimeoutMs?: number } = {}) {
  const now = options.now ?? Date.now
  let attempts: number[] = []
  let pending = false
  const forbidden = () => errorResponse(403, 'ORIGIN_REJECTED', 'Use this site to manage reviewer access.')
  const unavailable = () => errorResponse(503, 'REVIEWER_NOT_CONFIGURED', 'Reviewer sign-in is not configured. Contact the site owner.')
  const status = async (request: Request): Promise<Response> => {
    if (request.method !== 'GET') return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use GET.', { Allow: 'GET' })
    if (!sameOrigin(request, options.local, false)) return forbidden()
    if (!options.local && !reviewerConfigured(options)) return unavailable()
    const expiresAt = sessionExpiry(request, options)
    return jsonResponse(200, { authenticated: expiresAt !== null, localDevelopment: options.local === true, expiresAt })
  }
  const login = async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use POST.', { Allow: 'POST' })
    if (!sameOrigin(request, options.local)) return forbidden()
    if (!reviewerConfigured(options)) return unavailable()
    const time = now()
    attempts = attempts.filter(attempt => time - attempt < 3_600_000)
    if (pending || attempts.length >= 30 || attempts.filter(attempt => time - attempt < 900_000).length >= 5) return errorResponse(429, 'LOGIN_RATE_LIMITED', 'Too many sign-in attempts. Try again later.', { 'Retry-After': '900' })
    attempts.push(time); pending = true
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.bodyTimeoutMs ?? 3000)
    try {
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json' || ![null, 'identity'].includes(request.headers.get('content-encoding'))) return errorResponse(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use uncompressed JSON.')
      const length = request.headers.get('content-length')
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > 1024)) return errorResponse(413, 'REQUEST_TOO_LARGE', 'Sign-in request is too large.')
      const input: unknown = JSON.parse(await boundedText(request.body, 1024, AbortSignal.any([controller.signal, request.signal])))
      if (typeof input !== 'object' || input === null || Array.isArray(input) || Object.keys(input).length !== 1 || !('password' in input) || typeof input.password !== 'string' || input.password.length > 128 || !input.password.length) return errorResponse(400, 'INVALID_REQUEST', 'Provide a reviewer password.')
      if (!equalSecret(input.password, options.reviewerPassword!)) return errorResponse(401, 'INVALID_LOGIN', 'The reviewer password was not accepted.')
      const session = issueSession(new URL(request.url).origin, options)
      return jsonResponse(200, { authenticated: true, localDevelopment: options.local === true, expiresAt: session.expiresAt }, { 'Set-Cookie': sessionCookie(session.token) })
    } catch (error) {
      if (controller.signal.aborted || request.signal.aborted) return errorResponse(408, 'REQUEST_TIMEOUT', 'Sign-in timed out. Try again.')
      if (error instanceof SafeError) return errorResponse(error.status, error.code, error.message)
      return errorResponse(400, 'INVALID_REQUEST', 'Provide a JSON reviewer password.')
    } finally { clearTimeout(timer); pending = false }
  }
  const logout = async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use POST.', { Allow: 'POST' })
    if (!sameOrigin(request, options.local)) return forbidden()
    // Idempotently clear even an expired cookie or a session invalidated by configuration rotation.
    return jsonResponse(200, { authenticated: false, localDevelopment: options.local === true, expiresAt: null }, { 'Set-Cookie': sessionCookie('', true) })
  }
  return { login, status, logout }
}
