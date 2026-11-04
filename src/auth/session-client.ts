export interface ReviewerSession { authenticated: boolean; localDevelopment: boolean; expiresAt: number | null }
const messages: Record<string, string> = {
  INVALID_LOGIN: 'That reviewer password was not accepted. Check it and try again.',
  REVIEWER_NOT_CONFIGURED: 'Reviewer sign-in is not configured. Contact the site owner.',
  LOGIN_RATE_LIMITED: 'Too many sign-in attempts. Please wait 15 minutes before trying again.',
  ORIGIN_REJECTED: 'Open DealDesk directly on its own site, then try again.',
  REQUEST_TIMEOUT: 'Sign-in timed out. Check your connection and try again.',
}
export async function sessionRequest(action: 'session' | 'login' | 'logout', password?: string, fetchImpl: typeof fetch = fetch): Promise<ReviewerSession> {
  try {
    const response = await fetchImpl(`/api/auth/${action}`, {
      method: action === 'session' ? 'GET' : 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store',
      headers: action === 'login' ? { 'Content-Type': 'application/json' } : undefined,
      body: action === 'login' ? JSON.stringify({ password }) : undefined,
      signal: AbortSignal.timeout(10_000),
    })
    const value: unknown = await response.json()
    if (!response.ok) {
      const code = typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'object' && value.error !== null && 'code' in value.error ? String(value.error.code) : ''
      throw new Error(messages[code] ?? 'Reviewer access could not be confirmed. Try again or contact the site owner.')
    }
    if (typeof value !== 'object' || value === null || !('authenticated' in value) || typeof value.authenticated !== 'boolean' || !('localDevelopment' in value) || typeof value.localDevelopment !== 'boolean' || !('expiresAt' in value) ||
      (value.authenticated ? typeof value.expiresAt !== 'number' || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= Date.now() : value.expiresAt !== null)) throw new Error('Reviewer access returned an unexpected response. Reload to check again.')
    return value as ReviewerSession
  } catch (error) {
    if (error instanceof Error && (Object.values(messages).includes(error.message) || error.message.startsWith('Reviewer access'))) throw error
    throw new Error('Reviewer access could not be confirmed. Check your connection and try again.', { cause: error })
  }
}
