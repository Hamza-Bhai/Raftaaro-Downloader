import { describe, it, expect } from 'vitest'
import { splitRanges } from '../src/main/http/ranges'

describe('splitRanges', () => {
  it('splits into contiguous inclusive ranges, last takes remainder', () => {
    expect(splitRanges(10, 3)).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
      { start: 6, end: 9 }
    ])
  })
  it('never makes more parts than bytes', () => {
    expect(splitRanges(2, 8)).toHaveLength(2)
  })
  it('clamps parts to 1..16', () => {
    expect(splitRanges(100, 0)).toEqual([{ start: 0, end: 99 }])
    expect(splitRanges(1000, 50)).toHaveLength(16)
  })
})
