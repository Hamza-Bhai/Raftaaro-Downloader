import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { classifyYtDlpError, parseProgress, probe, buildDownloadArgs, YtDlpDownload } from '../src/main/video/ytdlp'
import type { Settings } from '../src/shared/types'

const settings: Settings = {
  folders: { videos: 'C:\\v', audio: 'C:\\a', files: 'C:\\f' },
  partsPerFile: 8,
  maxConcurrent: 3,
  useChromeCookies: false,
  apiToken: 'x'
}
const fake = { exe: process.execPath, preArgs: [join(__dirname, 'fixtures', 'fake-ytdlp.mjs')] }

describe('parseProgress', () => {
  it('parses an IDMP line', () => {
    expect(parseProgress('IDMP 1048576 4194304 NA 524288 6')).toEqual({
      downloaded: 1048576,
      totalBytes: 4194304,
      speedBps: 524288,
      etaSec: 6
    })
  })
  it('uses the estimate when the total is NA', () => {
    expect(parseProgress('IDMP 10 NA 200.5 NA NA')).toEqual({
      downloaded: 10,
      totalBytes: 201,
      speedBps: null,
      etaSec: null
    })
  })
  it('ignores other lines', () => {
    expect(parseProgress('[download] Destination: x.mp4')).toBeNull()
  })
})

describe('classifyYtDlpError', () => {
  it('asks for login on bot checks, private and login-required content', () => {
    const login = "Login chahiye — Settings mein 'Chrome login' on karein"
    expect(classifyYtDlpError("ERROR: [youtube] a: Sign in to confirm you're not a bot")).toBe(login)
    expect(classifyYtDlpError('ERROR: [youtube] a: Private video. Sign in if you have been granted access')).toBe(login)
    expect(
      classifyYtDlpError('ERROR: [Instagram] a: Requested content is not available, rate-limit reached or login required')
    ).toBe(login)
  })
  it('suggests updating on extraction and 403 errors', () => {
    const upd = 'yt-dlp purana ho gaya — Settings se update karein'
    expect(classifyYtDlpError('ERROR: unable to download video data: HTTP Error 403: Forbidden')).toBe(upd)
    expect(classifyYtDlpError('ERROR: [youtube] a: Unable to extract initial player response')).toBe(upd)
  })
  it('reports unavailable videos', () => {
    expect(classifyYtDlpError('ERROR: [youtube] a: Video unavailable')).toBe('Video dastiyab nahi')
  })
  it('falls back to the last ERROR line', () => {
    expect(classifyYtDlpError('WARNING: x\nERROR: something odd\n')).toBe('something odd')
    expect(classifyYtDlpError('')).toBe('Download nakam ho gaya')
  })
})

describe('probe', () => {
  it('returns VideoInfo for a single video', async () => {
    const info = await probe('https://www.youtube.com/watch?v=abc', settings, fake)
    expect(info).toMatchObject({
      kind: 'video',
      title: 'Test video — ✓ unicode',
      durationSec: 624,
      uploader: 'CatChannel',
      thumbnail: 'https://i.ytimg.com/vi/abc/hq.jpg'
    })
    if (info.kind !== 'video') throw new Error('expected video')
    expect(info.formats).toHaveLength(3)
    expect(info.formats[2]).toMatchObject({ format_id: '137', height: 1080, filesize: null, filesize_approx: 100000000 })
  })

  it('returns PlaylistInfo with entry urls', async () => {
    const info = await probe('https://www.youtube.com/playlist?list=PL1', settings, fake)
    expect(info).toEqual({
      kind: 'playlist',
      url: 'https://www.youtube.com/playlist?list=PL1',
      title: 'My playlist',
      entries: [
        { url: 'https://www.youtube.com/watch?v=v1', title: 'First', durationSec: 61 },
        { url: 'https://www.youtube.com/watch?v=v2', title: 'Second', durationSec: null }
      ]
    })
  })

  it('opens the Videos tab for a channel', async () => {
    const info = await probe('https://www.youtube.com/@chan', settings, fake)
    expect(info.kind).toBe('playlist')
    if (info.kind === 'playlist') expect(info.entries).toHaveLength(2)
  })

  it('passes cookies only when enabled and rejects with a friendly error', async () => {
    const log = join(mkdtempSync(join(tmpdir(), 'idm-yt-')), 'args.log')
    process.env.FAKE_YTDLP_LOG = log
    try {
      await probe('https://www.youtube.com/watch?v=abc', settings, fake)
      await probe('https://www.youtube.com/watch?v=abc', { ...settings, useChromeCookies: true }, fake)
      const calls = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as string[])
      expect(calls[0]).not.toContain('--cookies-from-browser')
      expect(calls[1].join(' ')).toContain('--cookies-from-browser chrome')
      expect(calls[0]).toContain('--no-playlist')
    } finally {
      delete process.env.FAKE_YTDLP_LOG
    }
    await expect(probe('https://www.youtube.com/watch?v=fail', settings, fake)).rejects.toThrow(/Login chahiye/)
  })
})

describe('YtDlpDownload', () => {
  it('reports combined progress, merging, and the real file size on done', async () => {
    const out = join(mkdtempSync(join(tmpdir(), 'idm-ytd-')), 'v.mp4')
    process.env.FAKE_YTDLP_OUT = out
    const job = {
      id: 'j',
      kind: 'video' as const,
      url: 'https://youtu.be/x',
      title: 'x',
      savePath: dirname(out),
      status: 'queued' as const,
      totalBytes: null,
      receivedBytes: 0,
      speedBps: 0,
      etaSec: null,
      createdAt: 0,
      choice: { media: 'video' as const, height: 'best' as const }
    }
    const d = new YtDlpDownload(job, settings, fake, 'C:\\bin')
    const progress: { received: number; total: number | null }[] = []
    const statuses: string[] = []
    d.on('progress', (p) => progress.push(p))
    d.on('status', (s) => statuses.push(s))
    const done = new Promise<string>((resolve, reject) => {
      d.on('done', resolve)
      d.on('error', reject)
    })
    try {
      await d.start()
      expect(await done).toBe(out)
    } finally {
      delete process.env.FAKE_YTDLP_OUT
    }
    // second stream continues after the first one's 1000 bytes
    expect(progress).toContainEqual(expect.objectContaining({ received: 1200, total: 1400 }))
    expect(statuses).toEqual(['merging'])
    expect(progress.at(-1)).toEqual(expect.objectContaining({ received: 1234, total: 1234 }))
  })

  it('prefers the real stream size over the dialog estimate', async () => {
    const out = join(mkdtempSync(join(tmpdir(), 'idm-ytd-')), 'v.mp4')
    process.env.FAKE_YTDLP_OUT = out
    const job = {
      id: 'j',
      kind: 'video' as const,
      url: 'https://youtu.be/x',
      title: 'x',
      savePath: dirname(out),
      status: 'queued' as const,
      totalBytes: 99999,
      receivedBytes: 0,
      speedBps: 0,
      etaSec: null,
      createdAt: 0
    }
    const d = new YtDlpDownload(job, settings, fake, 'C:\\bin')
    const progress: { received: number; total: number | null }[] = []
    d.on('progress', (p) => progress.push(p))
    try {
      await d.start()
    } finally {
      delete process.env.FAKE_YTDLP_OUT
    }
    expect(progress[0]).toEqual(expect.objectContaining({ received: 500, total: 1000 }))
  })
})

describe('buildDownloadArgs', () => {
  it('builds a full command for a video choice', () => {
    const args = buildDownloadArgs(
      { url: 'https://youtu.be/x', savePath: 'C:\\v', choice: { media: 'video', height: 1080 } },
      settings,
      'C:\\bin'
    )
    expect(args).toContain('--ffmpeg-location')
    expect(args[args.indexOf('--ffmpeg-location') + 1]).toBe('C:\\bin')
    expect(args[args.indexOf('-o') + 1]).toBe('C:\\v\\%(title).180B [%(id)s].%(ext)s')
    expect(args).toContain('--no-playlist')
    expect(args).toContain('--continue')
    // --print implies --quiet, which would hide progress and [Merger] lines
    expect(args.indexOf('--no-quiet')).toBeGreaterThan(args.indexOf('--print'))
    expect(args).toContain('--progress')
    expect(args.at(-1)).toBe('https://youtu.be/x')
    expect(args.join(' ')).toContain('bv*[height<=1080]+ba')
  })
})
