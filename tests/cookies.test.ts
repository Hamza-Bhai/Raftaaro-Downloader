import { describe, it, expect } from 'vitest'
import { toNetscapeCookies, type BrowserCookie } from '../src/main/video/cookies'

const base: BrowserCookie = {
  domain: '.youtube.com',
  hostOnly: false,
  path: '/',
  secure: true,
  session: false,
  expirationDate: 1893456000.75,
  name: 'SID',
  value: 'abc'
}

describe('toNetscapeCookies', () => {
  it('writes the Netscape cookie file format yt-dlp reads', () => {
    const text = toNetscapeCookies([base, { ...base, domain: 'www.youtube.com', hostOnly: true, secure: false, session: true, name: 'PREF', value: 'f6=8' }])
    expect(text).toBe(
      '# Netscape HTTP Cookie File\n' +
        '.youtube.com\tTRUE\t/\tTRUE\t1893456000\tSID\tabc\n' +
        'www.youtube.com\tFALSE\t/\tFALSE\t0\tPREF\tf6=8\n'
    )
  })

  it('keeps only YouTube, Google, Instagram and Facebook cookies', () => {
    const text = toNetscapeCookies([
      { ...base, domain: '.google.com', name: 'G' },
      { ...base, domain: '.instagram.com', name: 'I' },
      { ...base, domain: '.facebook.com', name: 'F' },
      { ...base, domain: '.evil.com', name: 'E' },
      { ...base, domain: 'notyoutube.com', name: 'N' }
    ])
    expect(text).toContain('\tG\t')
    expect(text).toContain('\tI\t')
    expect(text).toContain('\tF\t')
    expect(text).not.toContain('\tE\t')
    expect(text).not.toContain('\tN\t')
  })

  it('drops cookies that would break the file', () => {
    const text = toNetscapeCookies([{ ...base, value: 'a\nb' }, { ...base, name: 'x\ty' }])
    expect(text).toBe('# Netscape HTTP Cookie File\n')
  })
})
