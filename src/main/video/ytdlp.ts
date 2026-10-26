import { EventEmitter } from 'node:events'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { statSync } from 'node:fs'
import { join } from 'node:path'
import type { Job, PlaylistInfo, Settings, VideoInfo, YtFormat } from '../../shared/types'
import { buildFormatSelector } from './formats'

/** How to launch yt-dlp: the executable plus arguments that go before ours (tests use node + a stub). */
export interface YtDlpExec {
  exe: string
  preArgs?: string[]
}

export interface YtProgress {
  downloaded: number
  totalBytes: number | null
  speedBps: number | null
  etaSec: number | null
}

const PROGRESS_TEMPLATE =
  'download:IDMP %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s %(progress.speed)s %(progress.eta)s'
const FILE_MARK = 'IDMFILE:'

const num = (s: string | undefined): number | null => {
  if (s === undefined || s === 'NA' || s === 'None') return null
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n) : null
}

function fileSize(path: string): number | null {
  try {
    return statSync(path).size
  } catch {
    return null
  }
}

export function parseProgress(line: string): YtProgress | null {
  if (!line.startsWith('IDMP ')) return null
  const [, downloaded, total, estimate, speed, eta] = line.trim().split(/\s+/)
  return {
    downloaded: num(downloaded) ?? 0,
    totalBytes: num(total) ?? num(estimate),
    speedBps: num(speed),
    etaSec: num(eta)
  }
}

export function classifyYtDlpError(stderr: string): string {
  if (/sign in|login required|private video|log in/i.test(stderr)) {
    return "Login chahiye — Settings mein 'Chrome login' on karein"
  }
  if (/HTTP Error 403|Unable to extract|nsig|Requested format is not available/i.test(stderr)) {
    return 'yt-dlp purana ho gaya — Settings se update karein'
  }
  if (/Video unavailable|This video is not available/i.test(stderr)) return 'Video dastiyab nahi'
  const errors = stderr.split(/\r?\n/).filter((l) => l.startsWith('ERROR:'))
  const last = errors.at(-1)
  return last ? last.replace(/^ERROR:\s*/, '') : 'Download nakam ho gaya'
}

function commonArgs(settings: Settings): string[] {
  const args = ['--encoding', 'utf-8', '--no-warnings']
  if (settings.useChromeCookies) args.push('--cookies-from-browser', 'chrome')
  return args
}

/** A watch URL with &list= still means "this one video"; playlists are pasted as playlist URLs. */
function singleVideo(url: string): boolean {
  try {
    return new URL(url).searchParams.has('v') || /youtu\.be\//.test(url)
  } catch {
    return false
  }
}

function runJson(exec: YtDlpExec, args: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    execFile(
      exec.exe,
      [...(exec.preArgs ?? []), ...args],
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8', timeout: 120000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(classifyYtDlpError(stderr || err.message)))
        try {
          resolve(JSON.parse(stdout) as Record<string, unknown>)
        } catch {
          reject(new Error('yt-dlp ka jawab samajh nahi aaya'))
        }
      }
    )
  })
}

type Raw = Record<string, unknown>
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function toFormat(f: Raw): YtFormat {
  return {
    format_id: String(f.format_id ?? ''),
    ext: String(f.ext ?? ''),
    height: n(f.height),
    vcodec: String(f.vcodec ?? 'none'),
    acodec: String(f.acodec ?? 'none'),
    filesize: n(f.filesize),
    filesize_approx: n(f.filesize_approx),
    tbr: n(f.tbr)
  }
}

function entryUrl(e: Raw): string {
  const url = str(e.url)
  if (url && /^https?:/.test(url)) return url
  return `https://www.youtube.com/watch?v=${str(e.id) ?? url ?? ''}`
}

/** Ask yt-dlp what a link is: one video (with formats) or a playlist/channel (with entries). */
export async function probe(url: string, settings: Settings, exec: YtDlpExec): Promise<VideoInfo | PlaylistInfo> {
  const args = ['-J', '--flat-playlist', ...commonArgs(settings)]
  if (singleVideo(url)) args.push('--no-playlist')
  const raw = await runJson(exec, [...args, url])
  if (raw._type === 'playlist') {
    const entries = (Array.isArray(raw.entries) ? raw.entries : []) as Raw[]
    // a channel root lists its tabs (Videos, Shorts, ...); open the Videos tab instead
    if (entries.length && entries.every((e) => e.ie_key === 'YoutubeTab')) {
      const tab = entries.find((e) => /\/videos$/.test(str(e.url) ?? '')) ?? entries[0]
      return probe(String(tab.url), settings, exec)
    }
    return {
      kind: 'playlist',
      url,
      title: str(raw.title) ?? 'Playlist',
      entries: entries.map((e) => ({ url: entryUrl(e), title: str(e.title) ?? 'Video', durationSec: n(e.duration) }))
    }
  }
  return {
    kind: 'video',
    url,
    title: str(raw.title) ?? 'Video',
    durationSec: n(raw.duration),
    uploader: str(raw.uploader) ?? str(raw.channel),
    thumbnail: str(raw.thumbnail),
    formats: ((Array.isArray(raw.formats) ? raw.formats : []) as Raw[]).map(toFormat)
  }
}

export function buildDownloadArgs(
  job: Pick<Job, 'url' | 'savePath' | 'choice'>,
  settings: Settings,
  ffmpegDir: string
): string[] {
  const choice = job.choice ?? { media: 'video', height: 'best' }
  return [
    ...buildFormatSelector(choice),
    ...commonArgs(settings),
    '--ffmpeg-location',
    ffmpegDir,
    '-o',
    join(job.savePath, '%(title).180B [%(id)s].%(ext)s'),
    '--newline',
    '--progress-template',
    PROGRESS_TEMPLATE,
    '--print',
    `after_move:${FILE_MARK}%(filepath)s`,
    '--no-quiet',
    '--progress',
    '--no-mtime',
    '--continue',
    '--no-playlist',
    job.url
  ]
}

/** Runs one yt-dlp download as a queue Runner. */
export class YtDlpDownload extends EventEmitter {
  private child: ChildProcess | null = null
  private paused = false
  /** Bytes of streams already finished (video before audio, etc.). */
  private base = 0
  private current: YtProgress | null = null

  constructor(
    private readonly job: Job,
    private readonly settings: Settings,
    private readonly exec: YtDlpExec,
    private readonly ffmpegDir: string
  ) {
    super()
  }

  start(): Promise<void> {
    this.paused = false
    return new Promise((resolve) => {
      const args = [...(this.exec.preArgs ?? []), ...buildDownloadArgs(this.job, this.settings, this.ffmpegDir)]
      const child = spawn(this.exec.exe, args, { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
      this.child = child
      let stderr = ''
      let finalPath: string | null = null
      let buf = ''
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        buf += chunk
        let i: number
        while ((i = buf.search(/\r?\n/)) >= 0) {
          const line = buf.slice(0, i)
          buf = buf.slice(i + (buf[i] === '\r' ? 2 : 1))
          if (line.startsWith(FILE_MARK)) finalPath = line.slice(FILE_MARK.length).trim()
          else this.onLine(line)
        }
      })
      child.stderr.on('data', (chunk: string) => (stderr += chunk))
      child.on('error', (e) => {
        if (!this.paused) this.emit('error', new Error(`yt-dlp chal nahi saka: ${e.message}`))
        resolve()
      })
      child.on('close', (code) => {
        this.child = null
        if (this.paused) return resolve()
        if (code === 0 && finalPath) {
          const size = fileSize(finalPath)
          if (size !== null) this.emit('progress', { received: size, total: size, speedBps: 0 })
          this.emit('done', finalPath)
        } else this.emit('error', new Error(classifyYtDlpError(stderr)))
        resolve()
      })
    })
  }

  pause(): void {
    this.paused = true
    const pid = this.child?.pid
    if (!pid) return
    // yt-dlp may have spawned ffmpeg; kill the whole tree
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }, () => undefined)
  }

  private onLine(line: string): void {
    if (/^\[(Merger|ExtractAudio|VideoConvertor|FixupM3u8|VideoRemuxer)\]/.test(line)) {
      this.emit('status', 'merging')
      return
    }
    if (line.startsWith('[download] Destination:') && this.current) {
      this.base += this.current.totalBytes ?? this.current.downloaded
      this.current = null
      return
    }
    const p = parseProgress(line)
    if (!p) return
    this.current = p
    const received = this.base + p.downloaded
    const streamTotal = p.totalBytes === null ? null : this.base + p.totalBytes
    const total = streamTotal ?? this.job.totalBytes
    this.emit('progress', { received, total, speedBps: p.speedBps ?? 0 })
  }
}
