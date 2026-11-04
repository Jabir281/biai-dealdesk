import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { jsonResponse } from './draft.ts'

export function createLocalMiddleware(handler: (request: Request) => Promise<Response>, pathname: '/api/ai/draft' | '/api/ai/query' | '/api/auth/login' | '/api/auth/session' | '/api/auth/logout' = '/api/ai/draft') {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if ((req.url ?? '').split('?')[0] !== pathname) return next()
    const controller = new AbortController()
    const onClose = () => { if (!res.writableEnded) controller.abort() }
    res.on('close', onClose)
    try {
      const address = req.socket.remoteAddress
      const host = req.headers.host ?? ''
      const allowedHosts = ['localhost', '127.0.0.1', '[::1]'].map((name) => `${name}:${req.socket.localPort}`)
      let response: Response
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address ?? '') || !allowedHosts.includes(host)) {
        response = jsonResponse(403, { error: { code: 'LOCAL_ACCESS_ONLY', message: 'This development endpoint accepts loopback requests only.' } })
      } else {
        const headers = new Headers()
        for (let i = 0; i < req.rawHeaders.length; i += 2) headers.append(req.rawHeaders[i], req.rawHeaders[i + 1])
        const init: RequestInit & { duplex: 'half' } = { method: req.method, headers, signal: controller.signal, duplex: 'half' }
        if (req.method !== 'GET' && req.method !== 'HEAD') init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>
        response = await handler(new Request(`http://${host}${req.url}`, init))
      }
      res.writeHead(response.status, Object.fromEntries(response.headers))
      res.end(await response.text())
    } catch {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end('{"error":{"code":"INTERNAL_ERROR","message":"Draft request could not be completed."}}')
    } finally { res.off('close', onClose) }
  }
}
