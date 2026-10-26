import { describe, it, expect } from 'vitest'
import { formatBytes, formatEta } from '../src/shared/format'

describe('formatBytes', () => {
  it('formats with binary units', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(4 * 1024 * 1024)).toBe('4.0 MB')
    expect(formatBytes(1.2 * 1024 ** 3)).toBe('1.20 GB')
  })
  it('handles unknown sizes', () => {
    expect(formatBytes(null)).toBe('?')
  })
})

describe('formatEta', () => {
  it('uses Roman Urdu wording', () => {
    expect(formatEta(30)).toBe('30 sec baqi')
    expect(formatEta(125)).toBe('2 min baqi')
    expect(formatEta(7300)).toBe('2 ghante baqi')
    expect(formatEta(null)).toBe('')
  })
})
