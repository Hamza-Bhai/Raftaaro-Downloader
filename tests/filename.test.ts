import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { playlistFolder, sanitizeFileName, uniquePath } from '../src/main/util/filename'

describe('sanitizeFileName', () => {
  it('replaces Windows-illegal characters', () => {
    expect(sanitizeFileName('a<b>:c"d/e\\f|g?h*i')).toBe('a_b__c_d_e_f_g_h_i')
  })
  it('strips trailing dots and spaces', () => {
    expect(sanitizeFileName('song. ')).toBe('song')
  })
  it('prefixes reserved device names', () => {
    expect(sanitizeFileName('CON')).toBe('_CON')
    expect(sanitizeFileName('com1.txt')).toBe('_com1.txt')
  })
  it('falls back to "download" for empty names', () => {
    expect(sanitizeFileName('')).toBe('download')
    expect(sanitizeFileName(' . ')).toBe('download')
  })
  it('limits length to 200 characters', () => {
    expect(sanitizeFileName('x'.repeat(300)).length).toBeLessThanOrEqual(200)
  })
})

describe('playlistFolder', () => {
  it('puts a playlist in a sanitized subfolder', () => {
    expect(playlistFolder('C:\\v', 'My: list?')).toBe(join('C:\\v', 'My_ list_'))
  })
})

describe('uniquePath', () => {
  it('returns the plain path when free', () => {
    const dir = mkdtempSync(join(tmpdir(), 'idm-'))
    expect(uniquePath(dir, 'a.mp4')).toBe(join(dir, 'a.mp4'))
  })
  it('appends a counter when the file exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'idm-'))
    writeFileSync(join(dir, 'a.mp4'), '')
    expect(uniquePath(dir, 'a.mp4')).toBe(join(dir, 'a (1).mp4'))
    writeFileSync(join(dir, 'a (1).mp4'), '')
    expect(uniquePath(dir, 'a.mp4')).toBe(join(dir, 'a (2).mp4'))
  })
})
