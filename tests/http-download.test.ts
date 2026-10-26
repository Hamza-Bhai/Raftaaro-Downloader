import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { HttpDownload } from '../src/main/http/http-download'

const SIZE = 5 * 1024 * 1024
let data = randomBytes(SIZE)
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex')

/** Test server state; tests flip these flags. */
const srv = {
  ranges: true,
  slow: false,
  rangeRequests: [] as string[]
}
let server: Server
let base: string

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/missing') {
      res.writeHead(404).end()
      return
    }
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/file.bin' }).end()
      return
    }
    const range = req.headers.range
    if (range) srv.rangeRequests.push(range)
    const headers: Record<string, string | number> = { 'Content-Type': 'application/octet-stream' }
    if (srv.ranges) headers['Accept-Ranges'] = 'bytes'
    if (req.url === '/named') headers['Content-Disposition'] = 'attachment; filename="My:File?.bin"'
    if (srv.ranges && range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range)!
      const start = Number(m[1])
      const end = m[2] ? Math.min(Number(m[2]), data.length - 1) : data.length - 1
      headers['Content-Range'] = `bytes ${start}-${end}/${data.length}`
      headers['Content-Length'] = end - start + 1
      res.writeHead(206, headers)
      if (req.method === 'HEAD') return void res.end()
      return void send(res, data.subarray(start, end + 1))
    }
    if (srv.ranges) headers['Content-Length'] = data.length
    res.writeHead(200, headers)
    if (req.method === 'HEAD') return void res.end()
    send(res, data)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((r) => server.close(() => r())))

function send(res: import('node:http').ServerResponse, buf: Buffer): void {
  if (!srv.slow) return void res.end(buf)
  let i = 0
  const tick = (): void => {
    if (res.destroyed) return
    if (i >= buf.length) return void res.end()
    res.write(buf.subarray(i, i + 64 * 1024))
    i += 64 * 1024
    setTimeout(tick, 20)
  }
  tick()
}

const reset = (): void => {
  srv.ranges = true
  srv.slow = false
  srv.rangeRequests = []
}
const tmp = (): string => mkdtempSync(join(tmpdir(), 'raftaaro-http-'))
const run = (d: HttpDownload): Promise<string> =>
  new Promise((resolve, reject) => {
    d.on('done', resolve)
    d.on('error', reject)
    d.start().catch(reject)
  })

describe('HttpDownload', () => {
  it('downloads with 8 parts and output equals source bytes', async () => {
    reset()
    const dir = tmp()
    const path = await run(new HttpDownload({ url: `${base}/file.bin`, dir, parts: 8 }))
    expect(path).toBe(join(dir, 'file.bin'))
    expect(sha(readFileSync(path))).toBe(sha(data))
    expect(srv.rangeRequests.filter((r) => r !== 'bytes=0-0').length).toBe(8)
    expect(readdirSync(dir)).toEqual(['file.bin'])
  })

  it('uses a sanitized name from Content-Disposition', async () => {
    reset()
    const dir = tmp()
    const path = await run(new HttpDownload({ url: `${base}/named`, dir, parts: 2 }))
    expect(path).toBe(join(dir, 'My_File_.bin'))
  })

  it('follows redirects', async () => {
    reset()
    const dir = tmp()
    const path = await run(new HttpDownload({ url: `${base}/redirect`, dir, parts: 4 }))
    expect(sha(readFileSync(path))).toBe(sha(data))
  })

  it('falls back to single connection when ranges unsupported', async () => {
    reset()
    srv.ranges = false
    const dir = tmp()
    const d = new HttpDownload({ url: `${base}/file.bin`, dir, parts: 8 })
    let lastTotal: number | null | undefined
    d.on('progress', (p) => (lastTotal = p.total))
    const path = await run(d)
    expect(sha(readFileSync(path))).toBe(sha(data))
    expect(lastTotal ?? null).toBeNull()
  })

  it('resumes from existing part files', async () => {
    reset()
    srv.slow = true
    const dir = tmp()
    const first = new HttpDownload({ url: `${base}/file.bin`, dir, parts: 4 })
    await new Promise<void>((resolve, reject) => {
      first.on('progress', (p) => {
        if (p.received > SIZE / 2) {
          first.pause()
          resolve()
        }
      })
      first.on('error', reject)
      first.start().catch(reject)
    })
    await new Promise((r) => setTimeout(r, 100))
    srv.rangeRequests = []
    srv.slow = false
    const second = new HttpDownload({ url: `${base}/file.bin`, dir, parts: 4 })
    const path = await run(second)
    expect(sha(readFileSync(path))).toBe(sha(data))
    const starts = srv.rangeRequests
      .filter((r) => r !== 'bytes=0-0')
      .map((r) => Number(/bytes=(\d+)/.exec(r)![1]))
    const partStarts = [0, 1, 2, 3].map((i) => i * Math.floor(SIZE / 4))
    // at least one part resumed past its own start, so not everything was re-downloaded
    expect(starts.some((s) => !partStarts.includes(s))).toBe(true)
  })

  it('restarts when remote size changed', async () => {
    reset()
    srv.slow = true
    const dir = tmp()
    const first = new HttpDownload({ url: `${base}/file.bin`, dir, parts: 4 })
    await new Promise<void>((resolve, reject) => {
      first.on('progress', (p) => {
        if (p.received > SIZE / 4) {
          first.pause()
          resolve()
        }
      })
      first.on('error', reject)
      first.start().catch(reject)
    })
    await new Promise((r) => setTimeout(r, 100))
    const old = data
    data = randomBytes(SIZE - 1000)
    try {
      srv.slow = false
      const path = await run(new HttpDownload({ url: `${base}/file.bin`, dir, parts: 4 }))
      expect(sha(readFileSync(path))).toBe(sha(data))
    } finally {
      data = old
    }
  })

  it('keeps two simultaneous downloads of the same url apart', async () => {
    reset()
    const dir = tmp()
    const [a, b] = await Promise.all([
      run(new HttpDownload({ url: `${base}/file.bin`, dir, parts: 4 })),
      run(new HttpDownload({ url: `${base}/file.bin`, dir, parts: 4 }))
    ])
    expect(a).not.toBe(b)
    expect(sha(readFileSync(a))).toBe(sha(data))
    expect(sha(readFileSync(b))).toBe(sha(data))
  })

  it('emits error on 404 without creating the final file', async () => {
    reset()
    const dir = tmp()
    await expect(run(new HttpDownload({ url: `${base}/missing`, dir, parts: 4 }))).rejects.toThrow(
      /404/
    )
    expect(existsSync(join(dir, 'missing'))).toBe(false)
  })
})
