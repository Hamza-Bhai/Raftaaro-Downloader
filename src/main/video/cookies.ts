/** A cookie as Chrome's extension API (chrome.cookies) describes it. */
export interface BrowserCookie {
  domain: string
  hostOnly: boolean
  path: string
  secure: boolean
  session: boolean
  expirationDate?: number
  name: string
  value: string
}

const ALLOWED_DOMAINS = ['youtube.com', 'google.com']

function allowed(domain: string): boolean {
  const d = domain.replace(/^\./, '').toLowerCase()
  return ALLOWED_DOMAINS.some((a) => d === a || d.endsWith(`.${a}`))
}

const clean = (s: string): boolean => !/[\t\r\n]/.test(s)

/**
 * The YouTube login the extension sends, as a Netscape cookie file for `yt-dlp --cookies`.
 * Only YouTube/Google cookies are kept, and anything that would break the tab-separated format is dropped.
 */
export function toNetscapeCookies(cookies: BrowserCookie[]): string {
  const lines = ['# Netscape HTTP Cookie File']
  for (const c of cookies) {
    if (!allowed(c.domain) || ![c.domain, c.path, c.name, c.value].every(clean)) continue
    const expires = c.session || !c.expirationDate ? 0 : Math.floor(c.expirationDate)
    lines.push(
      [c.domain, c.hostOnly ? 'FALSE' : 'TRUE', c.path, c.secure ? 'TRUE' : 'FALSE', expires, c.name, c.value].join('\t')
    )
  }
  return lines.join('\n') + '\n'
}
