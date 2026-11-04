import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = '__Host-biai-reviewer'
export const SESSION_SECONDS = 2 * 60 * 60
export interface ReviewerOptions {
  reviewerPassword?: string
  sessionSecret?: string
  apiKey?: string
  accessToken?: string
  local?: boolean
  now?: () => number
}

// Configuration checks reject short/repetitive credentials; operators must generate random secrets.
export function reviewerConfigured(options: ReviewerOptions): boolean {
  const password = options.reviewerPassword ?? ''
  const secret = options.sessionSecret ?? ''
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter(pattern => pattern.test(password)).length
  return password.length >= 20 && password.length <= 128 && password.trim() === password &&
    !Array.from(password).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
    new Set(password).size >= 10 && classes >= 3 &&
    /^[a-fA-F0-9]{64}$/.test(secret) && new Set(secret.toLowerCase()).size >= 10 &&
    ![options.apiKey, options.accessToken, secret].includes(password) &&
    ![options.apiKey, options.accessToken].includes(secret)
}

export function equalSecret(actual: string, expected: string): boolean {
  // Fixed-length digests also hide input-length differences from the comparison itself.
  return timingSafeEqual(createHash('sha256').update(actual).digest(), createHash('sha256').update(expected).digest())
}

export function sameOrigin(request: Request, local = false, requireOrigin = true): boolean {
  const url = new URL(request.url)
  const host = request.headers.get('host')
  const origin = request.headers.get('origin')
  const site = request.headers.get('sec-fetch-site')
  if (host !== null && host !== url.host) return false
  if (url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) return false
  if (site !== null && !['same-origin', 'none'].includes(site)) return false
  return origin === url.origin || (!requireOrigin && origin === null)
}

function signingKey(options: ReviewerOptions): Buffer {
  // Changing either server secret invalidates all outstanding sessions.
  return createHmac('sha256', Buffer.from(options.sessionSecret!, 'hex')).update(`biai-reviewer-v1\0${options.reviewerPassword}`).digest()
}
function signature(payload: string, options: ReviewerOptions): Buffer {
  return createHmac('sha256', signingKey(options)).update(payload).digest()
}
export function issueSession(origin: string, options: ReviewerOptions) {
  if (!reviewerConfigured(options)) throw new Error('Reviewer access is not configured.')
  const issued = Math.floor((options.now ?? Date.now)() / 1000)
  const expires = issued + SESSION_SECONDS
  const payload = Buffer.from(JSON.stringify({ v: 1, iat: issued, exp: expires, aud: origin, nonce: randomBytes(16).toString('hex') })).toString('base64url')
  return { token: `${payload}.${signature(payload, options).toString('base64url')}`, expiresAt: expires * 1000 }
}

export function sessionExpiry(request: Request, options: ReviewerOptions): number | null {
  if (!reviewerConfigured(options)) return null
  const cookie = request.headers.get('cookie') ?? ''
  if (cookie.length > 8192) return null
  const values = cookie.split(';').map(part => part.trim()).filter(part => part.startsWith(`${SESSION_COOKIE}=`))
  if (values.length !== 1) return null
  const token = values[0].slice(SESSION_COOKIE.length + 1)
  if (token.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null
  const [payload, mac] = token.split('.')
  const supplied = Buffer.from(mac, 'base64url')
  if (supplied.toString('base64url') !== mac || !timingSafeEqual(supplied, signature(payload, options))) return null
  try {
    const decoded = Buffer.from(payload, 'base64url')
    if (decoded.toString('base64url') !== payload) return null
    const value: unknown = JSON.parse(decoded.toString('utf8'))
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const data = value as Record<string, unknown>
    const now = Math.floor((options.now ?? Date.now)() / 1000)
    if (Object.keys(data).sort().join(',') !== 'aud,exp,iat,nonce,v' || data.v !== 1 ||
      !Number.isSafeInteger(data.iat) || !Number.isSafeInteger(data.exp) ||
      typeof data.iat !== 'number' || typeof data.exp !== 'number' || data.iat > now || data.exp <= now ||
      data.exp - data.iat !== SESSION_SECONDS || data.aud !== new URL(request.url).origin ||
      typeof data.nonce !== 'string' || !/^[a-f0-9]{32}$/.test(data.nonce)) return null
    return data.exp * 1000
  } catch { return null }
}

export function sessionCookie(token: string, clear = false): string {
  return `${SESSION_COOKIE}=${clear ? '' : token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_SECONDS}${clear ? '; Expires=Thu, 01 Jan 1970 00:00:00 GMT' : ''}`
}
