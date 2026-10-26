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
