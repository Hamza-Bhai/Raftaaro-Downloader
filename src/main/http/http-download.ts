import { EventEmitter } from 'node:events'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { request as httpRequest, type IncomingMessage, type ClientRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { basename, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { sanitizeFileName, uniquePath } from '../util/filename'
import { splitRanges, type ByteRange } from './ranges'

export interface HttpDownloadOptions {
  url: string
  dir: string
  fileName?: string
  parts: number
  /** Final file path of an earlier, unfinished run of this download; resumes its parts. */
  resumePath?: string
}

export interface HttpProgress {
  received: number
  total: number | null
  speedBps: number
}

interface Meta {
  url: string
  total: number | null
  ranges: ByteRange[] | null
}

interface Probe {
  finalUrl: string
  total: number | null
  ranges: boolean
  fileName: string
}

const MAX_REDIRECTS = 10
/** Final paths owned by a running download in this process, so two downloads never share parts. */
const claimed = new Set<string>()
const PROGRESS_MS = 250
const SPEED_WINDOW_MS = 3000

/** Open a GET request, following redirects. Resolves with the response once headers arrive. */
function get(
  url: string,
  headers: Record<string, string>,
  track: (req: ClientRequest) => void,
  redirects = 0
): Promise<{ res: IncomingMessage; url: string }> {
  return new Promise((resolve, reject) => {
    const doRequest = url.startsWith('https:') ? httpsRequest : httpRequest
    const req = doRequest(url, { headers: { 'User-Agent': 'IDM-Downloader', ...headers } }, (res) => {
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        if (redirects >= MAX_REDIRECTS) return reject(new Error('Too many redirects'))
        const next = new URL(res.headers.location, url).toString()
        get(next, headers, track, redirects + 1).then(resolve, reject)
        return
      }
      if (status >= 400) {
        res.resume()
        return reject(new Error(`HTTP ${status}`))
      }
      resolve({ res, url })
    })
    track(req)
    req.on('error', reject)
    req.end()
  })
}

function fileNameFrom(res: IncomingMessage, url: string): string {
  const cd = res.headers['content-disposition'] ?? ''
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(cd)
  const plain = /filename="?([^";]+)"?/i.exec(cd)
  let name = ''
  if (star) name = decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''))
  else if (plain) name = plain[1].trim()
  else {
    try {
      name = decodeURIComponent(basename(new URL(url).pathname))
    } catch {
      name = ''
    }
  }
  return sanitizeFileName(name)
}

/** Multi-part HTTP(S) download with pause/resume. Parts live in `<final>.idmpart/` until joined. */
export class HttpDownload extends EventEmitter {
  finalPath = ''
  private requests = new Set<ClientRequest>()
  private paused = false
  private received = 0
  private samples: { t: number; bytes: number }[] = []
  private lastEmit = 0
  private total: number | null = null

  constructor(private readonly opts: HttpDownloadOptions) {
    super()
  }

  async start(): Promise<void> {
    this.paused = false
    try {
      const probe = await this.probe()
      if (this.paused) return
      this.total = probe.total
      this.finalPath = this.pickFinalPath(probe.fileName)
      claimed.add(this.finalPath)
      this.emit('path', this.finalPath)
      const stateDir = `${this.finalPath}.idmpart`
      const ranges = probe.ranges && probe.total ? splitRanges(probe.total, this.opts.parts) : null
      const meta = this.readMeta(stateDir)
      if (!meta || meta.url !== this.opts.url || meta.total !== probe.total || !probe.ranges) {
        rmSync(stateDir, { recursive: true, force: true })
        mkdirSync(stateDir, { recursive: true })
        writeFileSync(join(stateDir, 'meta.json'), JSON.stringify({ url: this.opts.url, total: probe.total, ranges }))
      }
      const plan = this.readMeta(stateDir)!.ranges
      if (plan) {
        this.received = plan.reduce((n, _r, i) => n + this.partSize(stateDir, i), 0)
        await Promise.all(plan.map((r, i) => this.fetchPart(probe.finalUrl, stateDir, i, r)))
      } else {
        this.received = 0
        await this.fetchPart(probe.finalUrl, stateDir, 0, null)
      }
      if (this.paused) return
      await this.join(stateDir, plan ? plan.length : 1)
      this.emitProgress(true)
      claimed.delete(this.finalPath)
      this.emit('done', this.finalPath)
    } catch (e) {
      claimed.delete(this.finalPath)
      if (this.paused) return
      this.stopRequests()
      this.emit('error', e instanceof Error ? e : new Error(String(e)))
    }
  }

  pause(): void {
    this.paused = true
    this.stopRequests()
    claimed.delete(this.finalPath)
  }

  private stopRequests(): void {
    for (const r of this.requests) r.destroy()
    this.requests.clear()
  }

  private track = (req: ClientRequest): void => {
    this.requests.add(req)
    req.on('close', () => this.requests.delete(req))
  }

  private async probe(): Promise<Probe> {
    const { res, url } = await get(this.opts.url, { Range: 'bytes=0-0' }, this.track)
    res.destroy()
    const name = this.opts.fileName ? sanitizeFileName(this.opts.fileName) : fileNameFrom(res, url)
    if (res.statusCode === 206) {
      const m = /\/(\d+)\s*$/.exec(String(res.headers['content-range'] ?? ''))
      if (m) return { finalUrl: url, total: Number(m[1]), ranges: true, fileName: name }
    }
    const len = Number(res.headers['content-length'])
    return { finalUrl: url, total: len > 0 ? len : null, ranges: false, fileName: name }
  }

  private pickFinalPath(fileName: string): string {
    const free = (p: string): boolean => !claimed.has(p)
    const resume = this.opts.resumePath
    if (resume && free(resume) && existsSync(`${resume}.idmpart`)) return resume
    const preferred = join(this.opts.dir, fileName)
    const meta = this.readMeta(`${preferred}.idmpart`)
    if (meta && meta.url === this.opts.url && !existsSync(preferred) && free(preferred)) return preferred
    mkdirSync(this.opts.dir, { recursive: true })
    // a name is free only if neither the file nor another download's part folder uses it
    for (let probe = fileName; ; ) {
      const candidate = uniquePath(this.opts.dir, probe)
      if (!existsSync(`${candidate}.idmpart`) && free(candidate)) return candidate
      probe = `_${probe}`
    }
  }

  private readMeta(stateDir: string): Meta | null {
    try {
      return JSON.parse(readFileSync(join(stateDir, 'meta.json'), 'utf8')) as Meta
    } catch {
      return null
    }
  }

  private partSize(stateDir: string, i: number): number {
    try {
      return statSync(join(stateDir, `part-${i}`)).size
    } catch {
      return 0
    }
  }

  private async fetchPart(url: string, stateDir: string, i: number, range: ByteRange | null): Promise<void> {
    const file = join(stateDir, `part-${i}`)
    let headers: Record<string, string> = {}
    let flags = 'w'
    if (range) {
      const have = this.partSize(stateDir, i)
      const from = range.start + have
      if (from > range.end) return
      headers = { Range: `bytes=${from}-${range.end}` }
      flags = 'a'
    }
    const { res } = await get(url, headers, this.track)
    if (range && res.statusCode !== 206) {
      res.destroy()
      throw new Error('Server stopped supporting resume')
    }
    res.on('data', (chunk: Buffer) => {
      this.received += chunk.length
      this.emitProgress(false)
    })
    try {
      await pipeline(res, createWriteStream(file, { flags }))
    } catch (e) {
      if (!this.paused) throw e
    }
    if (!this.paused && !res.complete) throw new Error('Connection closed early')
  }

  private async join(stateDir: string, count: number): Promise<void> {
    const tmp = `${this.finalPath}.joining`
    if (count === 1) {
      renameSync(join(stateDir, 'part-0'), tmp)
    } else {
      const out = createWriteStream(tmp)
      for (let i = 0; i < count; i++) {
        await pipeline(createReadStream(join(stateDir, `part-${i}`)), out, { end: false })
      }
      await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())))
    }
    renameSync(tmp, this.finalPath)
    rmSync(stateDir, { recursive: true, force: true })
  }

  private emitProgress(force: boolean): void {
    const now = Date.now()
    this.samples.push({ t: now, bytes: this.received })
    while (this.samples.length > 1 && now - this.samples[0].t > SPEED_WINDOW_MS) this.samples.shift()
    if (!force && now - this.lastEmit < PROGRESS_MS) return
    this.lastEmit = now
    const first = this.samples[0]
    const dt = (now - first.t) / 1000
    const speedBps = dt > 0 ? Math.round((this.received - first.bytes) / dt) : 0
    const p: HttpProgress = { received: this.received, total: this.total, speedBps }
    this.emit('progress', p)
  }
}
