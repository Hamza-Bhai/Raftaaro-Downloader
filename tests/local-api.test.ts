import { describe, it, expect, afterEach } from 'vitest'
import { startLocalApi, type LocalApi } from '../src/main/local-api'

const TOKEN = 'a'.repeat(32)
let api: LocalApi | null = null
let calls: { url: string; title?: string }[] = []

async function start(): Promise<string> {
  calls = []
  api = await startLocalApi({ port: 0, token: TOKEN, onLink: (url, title) => calls.push({ url, title }) })
  return `http://127.0.0.1:${api.port}`
}

afterEach(async () => {
  await api?.close()
  api = null
})

const post = (base: string, body: unknown, token = TOKEN): Promise<Response> =>
  fetch(`${base}/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Raftaaro-Token': token },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })

describe('local API', () => {
  it('listens on loopback only', async () => {
    await start()
    expect(api!.address).toBe('127.0.0.1')
  })

  it('answers ping with the app name when the token is right', async () => {
    const base = await start()
    const ok = await fetch(`${base}/ping`, { headers: { 'X-Raftaaro-Token': TOKEN } })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ app: 'Raftaaro' })
    expect((await fetch(`${base}/ping`)).status).toBe(401)
  })

  it('accepts a link with the correct token', async () => {
    const base = await start()
    const r = await post(base, { url: 'https://youtu.be/x', title: 'X' })
    expect(r.status).toBe(202)
    expect(calls).toEqual([{ url: 'https://youtu.be/x', title: 'X' }])
  })

  it('rejects a wrong token without calling onLink', async () => {
    const base = await start()
    expect((await post(base, { url: 'https://youtu.be/x' }, 'b'.repeat(32))).status).toBe(401)
    expect(calls).toEqual([])
  })

  it('rejects non-http urls and bad json', async () => {
    const base = await start()
    expect((await post(base, { url: 'javascript:alert(1)' })).status).toBe(400)
    expect((await post(base, '{nope')).status).toBe(400)
    expect(calls).toEqual([])
  })

  it('rejects oversized bodies', async () => {
    const base = await start()
    const r = await post(base, { url: 'https://x.com/' + 'a'.repeat(20 * 1024) })
    expect(r.status).toBe(413)
    expect(calls).toEqual([])
  })

  it('does not grant CORS to web pages', async () => {
    const base = await start()
    const r = await fetch(`${base}/add`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })
    expect(r.headers.get('access-control-allow-origin')).toBeNull()
    const ext = await fetch(`${base}/add`, { method: 'OPTIONS', headers: { Origin: 'chrome-extension://abc' } })
    expect(ext.headers.get('access-control-allow-origin')).toBe('chrome-extension://abc')
  })
})
