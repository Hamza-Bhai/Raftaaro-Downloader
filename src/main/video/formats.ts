import type { MediaType, QualityOption, VideoChoice, VideoInfo, YtFormat } from '../../shared/types'

const HEIGHT_NAMES: Record<number, string> = { 4320: '8K', 2160: '4K', 1440: '2K' }

/** Known size, else bitrate (kbit/s) x duration. */
const sizeOf = (f: YtFormat, durationSec: number | null): number | null =>
  f.filesize ?? f.filesize_approx ?? (f.tbr && durationSec ? Math.round((f.tbr * 1000 * durationSec) / 8) : null)

/** Mirrors the -S codec preference below: H.264 first, then H.265, VP9, AV1, anything else. */
function codecRank(vcodec: string): number {
  const order = [/^(avc|h264)/, /^(hev|hvc|h265)/, /^vp0?9/, /^av0?1/]
  const i = order.findIndex((re) => re.test(vcodec))
  return i === -1 ? order.length : i
}

const hasVideo = (f: YtFormat): boolean => !!f.vcodec && f.vcodec !== 'none'
const hasAudio = (f: YtFormat): boolean => !!f.acodec && f.acodec !== 'none'

function heightLabel(h: number): string {
  return HEIGHT_NAMES[h] ? `${h}p (${HEIGHT_NAMES[h]})` : `${h}p`
}

function largestAudioSize(formats: YtFormat[], durationSec: number | null): number | null {
  const sizes = formats.filter((f) => hasAudio(f) && !hasVideo(f)).map((f) => sizeOf(f, durationSec))
  const known = sizes.filter((s): s is number => s !== null)
  return known.length ? Math.max(...known) : null
}

/** Size of what yt-dlp will produce for this height: the preferred-codec video there, plus audio if separate. */
function estimateForHeight(formats: YtFormat[], height: number, durationSec: number | null): number | null {
  const atHeight = formats
    .filter((f) => hasVideo(f) && f.height === height)
    .sort(
      (a, b) =>
        // sized formats are plain https downloads, which -S proto puts before sizeless HLS ones
        Number(sizeOf(b, null) !== null) - Number(sizeOf(a, null) !== null) ||
        codecRank(a.vcodec) - codecRank(b.vcodec) ||
        (b.tbr ?? 0) - (a.tbr ?? 0)
    )
  const pick = atHeight[0]
  if (!pick) return null
  const video = sizeOf(pick, durationSec)
  if (video === null) return null
  if (hasAudio(pick)) return video
  const audio = largestAudioSize(formats, durationSec)
  return audio === null ? null : video + audio
}

/** Choices for the quality dropdown. Only heights that really exist are offered. */
export function buildQualityOptions(info: VideoInfo, media: MediaType): QualityOption[] {
  if (media === 'audio') {
    const estBytes = largestAudioSize(info.formats, info.durationSec)
    return [
      { value: 'best', label: 'MP3', audioFormat: 'mp3', estBytes },
      { value: 'best', label: 'M4A', audioFormat: 'm4a', estBytes }
    ]
  }
  const heights = [
    ...new Set(info.formats.filter((f) => hasVideo(f) && f.height).map((f) => f.height as number))
  ].sort((a, b) => b - a)
  const options: QualityOption[] = heights.map((h) => ({
    value: h,
    label: heightLabel(h),
    estBytes: estimateForHeight(info.formats, h, info.durationSec)
  }))
  const top = options[0]
  return [
    { value: 'best', label: top ? `⭐ Best (${top.label})` : '⭐ Best', estBytes: top?.estBytes ?? null },
    ...options
  ]
}

/** yt-dlp arguments selecting the formats for a choice. Video always includes an audio stream. */
export function buildFormatSelector(choice: VideoChoice): string[] {
  if (choice.media === 'audio') {
    if (choice.audioFormat === 'm4a') return ['-f', 'ba[ext=m4a]/ba/b', '-x', '--audio-format', 'm4a']
    return ['-f', 'ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '0']
  }
  // proto: at the same height a plain https download (exact size) beats a streamed m3u8 one,
  // which YouTube offers with audio included when signed in and which only has a guessed size
  const merge = ['-S', 'res,proto,+codec:avc:m4a', '--merge-output-format', 'mp4']
  if (choice.height === 'best') return ['-f', 'bv*+ba/b', ...merge]
  const h = choice.height
  return ['-f', `bv*[height<=${h}]+ba/b[height<=${h}]/bv*+ba/b`, ...merge]
}
