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
  /** A Node-compatible executable yt-dlp may use as its JavaScript runtime (YouTube needs one). */
  nodePath?: string
}

export interface YtProgress {
  downloaded: number
  totalBytes: number | null
  speedBps: number | null
  etaSec: number | null
}

const PROGRESS_TEMPLATE =
  'download:RFTP %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s %(progress.speed)s %(progress.eta)s'
const FILE_MARK = 'RFTFILE:'

const num = (s: string | undefined): number | null => {
  if (s === undefined || s === 'NA' || s === 'None') return null
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n) : null
}

/** The output file a yt-dlp status line refers to, if any. */
function pathFromLine(line: string): string | null {
  const m =
    /^\[download\] (.+) has already been downloaded/.exec(line) ??
    /^\[Merger\] Merging formats into "(.+)"$/.exec(line) ??
    /^\[ExtractAudio\] Destination: (.+)$/.exec(line)
  return m ? m[1].trim() : null
}

function fileSize(path: string): number | null {
  try {
    return statSync(path).size
  } catch {
    return null
  }
}

export function parseProgress(line: string): YtProgress | null {
  if (!line.startsWith('RFTP ')) return null
  const [, downloaded, total, estimate, speed, eta] = line.trim().split(/\s+/)
  return {
    downloaded: num(downloaded) ?? 0,
    totalBytes: num(total) ?? num(estimate),
    speedBps: num(speed),
    etaSec: num(eta)
  }
}

/**
 * Chrome locks its cookie file while it runs and, since v127, encrypts cookies in a way yt-dlp
 * often cannot read on Windows. The extension is used from inside Chrome, so this is common.
 */
const COOKIE_ERROR = /cookie database|Failed to decrypt with DPAPI|could not find .*cookies|cookies? .*locked/i
const COOKIE_MESSAGE =
  'Could not read your Chrome login (Chrome keeps it locked). Turn off "Use my Chrome login" in Settings, or fully close Chrome and retry.'

export function classifyYtDlpError(stderr: string): string {
  if (COOKIE_ERROR.test(stderr)) return COOKIE_MESSAGE
  if (/sign in|login required|private video|log in/i.test(stderr)) {
    return 'Sign-in required — turn on "Use my Chrome login" in Settings'
  }
  if (/HTTP Error 403|Unable to extract|nsig|Requested format is not available/i.test(stderr)) {
    return 'yt-dlp is out of date — update it in Settings'
  }
  if (/Video unavailable|This video is not available/i.test(stderr)) return 'Video unavailable'
  const errors = stderr.split(/\r?\n/).filter((l) => l.startsWith('ERROR:'))
  const last = errors.at(-1)
  return last ? last.replace(/^ERROR:\s*/, '') : 'Download failed'
}

/** Electron's executable acts as plain Node when yt-dlp runs it as its JS runtime. */
function ytEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PYTHONIOENCODING: 'utf-8', ELECTRON_RUN_AS_NODE: '1' }
}

function commonArgs(settings: Settings, nodePath?: string): string[] {
  const args = ['--encoding', 'utf-8', '--no-warnings']
  if (nodePath) args.push('--js-runtimes', `node:${nodePath}`)
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
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8', timeout: 120000, env: ytEnv() },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(classifyYtDlpError(stderr || err.message)))
        try {
          resolve(JSON.parse(stdout) as Record<string, unknown>)
        } catch {
          reject(new Error('Could not read the answer from yt-dlp'))
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
  const args = ['-J', '--flat-playlist', ...commonArgs(settings, exec.nodePath)]
  if (singleVideo(url)) args.push('--no-playlist')
  let raw: Raw
  try {
    raw = await runJson(exec, [...args, url])
  } catch (e) {
    // an unreadable Chrome login should not block public videos: try again without it
    if (settings.useChromeCookies && e instanceof Error && e.message === COOKIE_MESSAGE) {
      return probe(url, { ...settings, useChromeCookies: false }, exec)
    }
    throw e
  }
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
  ffmpegDir: string,
  nodePath?: string
): string[] {
  const choice = job.choice ?? { media: 'video', height: 'best' }
  const qualityTag = choice.media === 'video' && choice.height !== 'best' ? ` ${choice.height}p` : ''
  return [
    ...buildFormatSelector(choice),
    ...commonArgs(settings, nodePath),
    '--ffmpeg-location',
    ffmpegDir,
    '-o',
    join(job.savePath, `%(title).170B [%(id)s]${qualityTag}.%(ext)s`),
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

  async start(): Promise<void> {
    this.paused = false
    let settings = this.settings
    for (;;) {
      const stderr = await this.runOnce(settings)
      if (stderr === null || this.paused) return
      const message = classifyYtDlpError(stderr)
      // an unreadable Chrome login should not block public videos: try again without it
      if (settings.useChromeCookies && message === COOKIE_MESSAGE) {
        settings = { ...settings, useChromeCookies: false }
        continue
      }
      this.emit('error', new Error(message))
      return
    }
  }

  /** Run yt-dlp once. Resolves null when finished or already reported, else yt-dlp's stderr. */
  private runOnce(settings: Settings): Promise<string | null> {
    this.base = 0
    this.current = null
    return new Promise((resolve) => {
      const args = [...(this.exec.preArgs ?? []), ...buildDownloadArgs(this.job, settings, this.ffmpegDir, this.exec.nodePath)]
      const child = spawn(this.exec.exe, args, { windowsHide: true, env: ytEnv() })
      this.child = child
      let stderr = ''
      let finalPath: string | null = null
      // fallback when yt-dlp skips the after_move print, e.g. for an already downloaded file
      let seenPath: string | null = null
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
          else {
            seenPath = pathFromLine(line) ?? seenPath
            this.onLine(line)
          }
        }
      })
      child.stderr.on('data', (chunk: string) => (stderr += chunk))
      child.on('error', (e) => {
        if (!this.paused) this.emit('error', new Error(`Could not start yt-dlp: ${e.message}`))
        resolve(null)
      })
      child.on('close', (code) => {
        this.child = null
        if (this.paused) return resolve(null)
        const path = finalPath ?? (seenPath && fileSize(seenPath) !== null ? seenPath : null)
        if (code === 0 && path) {
          const size = fileSize(path)
          if (size !== null) this.emit('progress', { received: size, total: size, speedBps: 0 })
          this.emit('done', path)
          return resolve(null)
        }
        resolve(stderr)
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
