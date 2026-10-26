import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import type { AddressInfo } from 'node:net'

export const LOCAL_API_PORT = 47821
const MAX_BODY = 16 * 1024

export interface LocalApiOptions {
  port: number
  token: string
  onLink: (url: string, title?: string) => void
}

export interface LocalApi {
  port: number
  address: string
  close(): Promise<void>
}

function tokenOk(req: IncomingMessage, token: string): boolean {
  const given = Buffer.from(String(req.headers['x-idm-token'] ?? ''))
  const want = Buffer.from(token)
  return given.length === want.length && timingSafeEqual(given, want)
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  res.writeHead(status, body === undefined ? {} : { 'Content-Type': 'application/json' })
  res.end(body === undefined ? undefined : JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size <= MAX_BODY) chunks.push(c)
    })
    // read to the end either way so the client receives our answer instead of a reset
    req.on('end', () => resolve(size > MAX_BODY ? null : Buffer.concat(chunks).toString('utf8')))
  })
}

/**
 * Loopback-only HTTP endpoint the Chrome extension uses to hand links to the app.
 * Every request must carry the X-IDM-Token header; only chrome-extension:// origins get CORS.
 */
export function startLocalApi(opts: LocalApiOptions): Promise<LocalApi> {
  const server = createServer(async (req, res) => {
    const origin = String(req.headers.origin ?? '')
    if (origin.startsWith('chrome-extension://')) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-IDM-Token')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST')
    }
    if (req.method === 'OPTIONS') return send(res, 204)
    if (!tokenOk(req, opts.token)) return send(res, 401, { error: 'bad token' })

    if (req.method === 'GET' && req.url === '/ping') return send(res, 200, { app: 'IDM-Downloader' })
    if (req.method === 'POST' && req.url === '/add') {
      const body = await readBody(req)
      if (body === null) return send(res, 413, { error: 'too large' })
      let data: { url?: unknown; title?: unknown }
      try {
        data = JSON.parse(body) as typeof data
      } catch {
        return send(res, 400, { error: 'bad json' })
      }
      const url = typeof data.url === 'string' ? data.url : ''
      if (!/^https?:\/\//i.test(url)) return send(res, 400, { error: 'bad url' })
      opts.onLink(url, typeof data.title === 'string' ? data.title : undefined)
      return send(res, 202, { ok: true })
    }
    send(res, 404, { error: 'not found' })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(opts.port, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo
      resolve({
        port: addr.port,
        address: addr.address,
        close: () => new Promise<void>((r) => server.close(() => r()))
      })
    })
  })
}
