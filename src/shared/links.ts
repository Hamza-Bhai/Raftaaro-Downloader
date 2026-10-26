const VIDEO_HOSTS = [
  'youtube.com',
  'youtu.be',
  'facebook.com',
  'fb.watch',
  'instagram.com',
  'tiktok.com',
  'x.com',
  'twitter.com',
  'vimeo.com',
  'dailymotion.com'
]

function parseHttpUrl(text: string): URL | null {
  try {
    const url = new URL(text)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** True when the text is exactly one http(s) URL (surrounding whitespace allowed). */
export function isDownloadableUrl(text: string): boolean {
  const t = text.trim()
  return t !== '' && !/\s/.test(t) && parseHttpUrl(t) !== null
}

/** First http(s) link found in free text (e.g. the clipboard), without trailing punctuation. */
export function extractFirstUrl(text: string): string | null {
  const m = /https?:\/\/[^\s<>"']+/i.exec(text)
  if (!m) return null
  const url = m[0].replace(/[).,;:!?\]]+$/, '')
  return parseHttpUrl(url) ? url : null
}

function hostIs(url: string, hosts: string[]): boolean {
  const parsed = parseHttpUrl(url.trim())
  if (!parsed) return false
  const host = parsed.hostname.toLowerCase()
  return hosts.some((h) => host === h || host.endsWith(`.${h}`))
}

/** YouTube links get extra care: slower requests and one download at a time. */
export function isYouTubeUrl(url: string): boolean {
  return hostIs(url, ['youtube.com', 'youtu.be'])
}

/** True when the URL belongs to a site handled by yt-dlp rather than a plain file download. */
export function isVideoSiteUrl(url: string): boolean {
  return hostIs(url, VIDEO_HOSTS)
}
