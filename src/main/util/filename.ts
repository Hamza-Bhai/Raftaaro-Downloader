import { existsSync } from 'node:fs'
import { extname, join } from 'node:path'

// control characters are not allowed in Windows file names either
// eslint-disable-next-line no-control-regex
const ILLEGAL = /[<>:"/\\|?*\x00-\x1f]/g
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i
const MAX_LEN = 200

/** Make a string safe to use as a Windows file name. */
export function sanitizeFileName(name: string): string {
  let out = name
    .replace(ILLEGAL, '_')
    .trim()
    .replace(/[. ]+$/, '')
  if (RESERVED.test(out)) out = `_${out}`
  if (out.length > MAX_LEN) {
    const ext = extname(out).slice(0, 16)
    out = out.slice(0, MAX_LEN - ext.length) + ext
  }
  return out || 'download'
}

/** Folder for a playlist's videos: a subfolder named after the playlist. */
export function playlistFolder(base: string, title: string): string {
  return join(base, sanitizeFileName(title))
}

/** Path inside `dir` for `fileName` that does not exist yet: "a.mp4", "a (1).mp4", ... */
export function uniquePath(dir: string, fileName: string): string {
  const ext = extname(fileName)
  const base = fileName.slice(0, fileName.length - ext.length)
  let candidate = join(dir, fileName)
  for (let i = 1; existsSync(candidate); i++) candidate = join(dir, `${base} (${i})${ext}`)
  return candidate
}
