import { describe, it, expect } from 'vitest'
import { shouldUpdateYtDlp } from '../src/main/video/update-policy'

const DAY = 24 * 60 * 60 * 1000

describe('shouldUpdateYtDlp', () => {
  it('updates when it never has', () => {
    expect(shouldUpdateYtDlp(undefined, Date.now())).toBe(true)
  })
  it('updates once a day at most', () => {
    const now = 10 * DAY
    expect(shouldUpdateYtDlp(now - DAY + 1000, now)).toBe(false)
    expect(shouldUpdateYtDlp(now - DAY - 1000, now)).toBe(true)
  })
  it('updates when the clock went backwards', () => {
    expect(shouldUpdateYtDlp(20 * DAY, 10 * DAY)).toBe(true)
  })
})
