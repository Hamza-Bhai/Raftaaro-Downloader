import { describe, it, expect } from 'vitest'
import { isDownloadableUrl, isVideoSiteUrl } from '../src/main/util/links'

describe('isDownloadableUrl', () => {
  it('accepts a trimmed http(s) url', () => {
    expect(isDownloadableUrl(' https://x.com/a.zip ')).toBe(true)
    expect(isDownloadableUrl('http://example.com')).toBe(true)
  })
  it('rejects text with more than one token', () => {
    expect(isDownloadableUrl('hello https://x.com')).toBe(false)
  })
  it('rejects other schemes and junk', () => {
    expect(isDownloadableUrl('ftp://x')).toBe(false)
    expect(isDownloadableUrl('javascript:alert(1)')).toBe(false)
    expect(isDownloadableUrl('')).toBe(false)
  })
})

describe('isVideoSiteUrl', () => {
  it('detects known video hosts and subdomains', () => {
    expect(isVideoSiteUrl('https://youtu.be/abc')).toBe(true)
    expect(isVideoSiteUrl('https://m.youtube.com/watch?v=1')).toBe(true)
    expect(isVideoSiteUrl('https://www.instagram.com/reel/x')).toBe(true)
    expect(isVideoSiteUrl('https://fb.watch/x')).toBe(true)
  })
  it('rejects other hosts and look-alikes', () => {
    expect(isVideoSiteUrl('https://example.com/a.mp4')).toBe(false)
    expect(isVideoSiteUrl('https://notyoutube.com/x')).toBe(false)
    expect(isVideoSiteUrl('not a url')).toBe(false)
  })
})
