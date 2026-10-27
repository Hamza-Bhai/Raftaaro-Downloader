import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildFormatSelector, buildQualityOptions } from '../src/main/video/formats'
import type { VideoChoice, VideoInfo } from '../src/shared/types'

const fixture = (name: string): VideoInfo =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8')) as VideoInfo

describe('buildQualityOptions', () => {
  it('lists Best first then every real height, highest first', () => {
    const opts = buildQualityOptions(fixture('yt-4k.json'), 'video')
    expect(opts.map((o) => o.label)).toEqual(['⭐ Best (2160p (4K))', '2160p (4K)', '1080p', '360p'])
    expect(opts.map((o) => o.value)).toEqual(['best', 2160, 1080, 360])
  })

  it('estimates size as video + best audio', () => {
    const opts = buildQualityOptions(fixture('yt-4k.json'), 'video')
    expect(opts.find((o) => o.value === 1080)!.estBytes).toBe(100000000 + 10000000)
    expect(opts.find((o) => o.value === 2160)!.estBytes).toBe(580000000 + 10000000)
  })

  it('uses the muxed size alone when the format already has audio', () => {
    const opts = buildQualityOptions(fixture('muxed-only.json'), 'video')
    expect(opts.map((o) => o.value)).toEqual(['best', 720, 360])
    expect(opts.find((o) => o.value === 720)!.estBytes).toBe(12000000)
    expect(opts.find((o) => o.value === 360)!.estBytes).toBeNull()
  })

  it('offers MP3 and M4A for audio', () => {
    const opts = buildQualityOptions(fixture('yt-4k.json'), 'audio')
    expect(opts).toEqual([
      { value: 'best', label: 'MP3', audioFormat: 'mp3', estBytes: 10000000 },
      { value: 'best', label: 'M4A', audioFormat: 'm4a', estBytes: 10000000 }
    ])
  })

  it('estimates from bitrate and duration when sizes are missing', () => {
    const info = fixture('yt-4k.json')
    info.formats = [
      {
        format_id: 'v',
        ext: 'mp4',
        height: 720,
        vcodec: 'avc1',
        acodec: 'none',
        filesize: null,
        filesize_approx: null,
        tbr: 1000
      },
      {
        format_id: 'a',
        ext: 'm4a',
        height: null,
        vcodec: 'none',
        acodec: 'mp4a',
        filesize: null,
        filesize_approx: null,
        tbr: 128
      }
    ]
    // (1000 + 128) kbit/s * 624 s / 8 = 87,984,000 bytes
    expect(buildQualityOptions(info, 'video').find((o) => o.value === 720)!.estBytes).toBe(87984000)
  })

  it('estimates with the H.264 stream when one exists at that height', () => {
    const info = fixture('yt-4k.json')
    // 1080p has avc1 (100 MB) and a higher-bitrate vp9 (90 MB approx): the avc1 one is what gets downloaded
    info.formats = info.formats.map((f) => (f.format_id === '248' ? { ...f, tbr: 9000 } : f))
    expect(buildQualityOptions(info, 'video').find((o) => o.value === 1080)!.estBytes).toBe(110000000)
  })

  it('prefers a stream with a known size over a sizeless (HLS) one of the same codec', () => {
    const info = fixture('yt-4k.json')
    info.formats.push({
      format_id: '96',
      ext: 'mp4',
      height: 1080,
      vcodec: 'avc1.640028',
      acodec: 'none',
      filesize: null,
      filesize_approx: null,
      tbr: 9000
    })
    expect(buildQualityOptions(info, 'video').find((o) => o.value === 1080)!.estBytes).toBe(110000000)
  })

  it('still offers Best when no heights are known', () => {
    const info = { ...fixture('muxed-only.json'), formats: [] }
    expect(buildQualityOptions(info, 'video')).toEqual([{ value: 'best', label: '⭐ Best', estBytes: null }])
  })
})

describe('buildFormatSelector', () => {
  const videoChoices: VideoChoice[] = [
    { media: 'video', height: 'best' },
    { media: 'video', height: 1080 },
    { media: 'video', height: 360 }
  ]

  it('never selects a video-only stream without audio', () => {
    for (const c of videoChoices) {
      const args = buildFormatSelector(c)
      const f = args[args.indexOf('-f') + 1]
      expect(f).toContain('+ba')
      expect(args).toContain('--merge-output-format')
      expect(args[args.indexOf('--merge-output-format') + 1]).toBe('mp4')
    }
  })

  it('prefers widely playable H.264 video and m4a audio at the chosen resolution', () => {
    for (const c of videoChoices) {
      const args = buildFormatSelector(c)
      // proto: plain https downloads (known size) beat streamed m3u8 ones of the same height
      expect(args[args.indexOf('-S') + 1]).toBe('res,proto,+codec:avc:m4a')
    }
  })

  it('caps the height for a chosen quality', () => {
    const args = buildFormatSelector({ media: 'video', height: 720 })
    expect(args[args.indexOf('-f') + 1]).toBe('bv*[height<=720]+ba/b[height<=720]/bv*+ba/b')
  })

  it('extracts mp3 and m4a audio', () => {
    const mp3 = buildFormatSelector({ media: 'audio', height: 'best', audioFormat: 'mp3' })
    expect(mp3).toEqual(['-f', 'ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '0'])
    const m4a = buildFormatSelector({ media: 'audio', height: 'best', audioFormat: 'm4a' })
    expect(m4a).toEqual(['-f', 'ba[ext=m4a]/ba/b', '-x', '--audio-format', 'm4a'])
  })
})
