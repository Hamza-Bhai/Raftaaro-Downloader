export interface ByteRange {
  start: number
  /** Inclusive. */
  end: number
}

/** Split `size` bytes into at most `parts` (clamped to 1..16) contiguous inclusive ranges. */
export function splitRanges(size: number, parts: number): ByteRange[] {
  const count = Math.max(1, Math.min(16, Math.floor(parts) || 1, size))
  const chunk = Math.floor(size / count)
  const ranges: ByteRange[] = []
  for (let i = 0; i < count; i++) {
    const start = i * chunk
    ranges.push({ start, end: i === count - 1 ? size - 1 : start + chunk - 1 })
  }
  return ranges
}
