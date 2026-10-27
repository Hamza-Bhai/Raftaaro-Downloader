// Downloads yt-dlp.exe, ffmpeg.exe and ffprobe.exe into resources/bin, verifying SHA-256 checksums.
// Skips files that already exist unless --force is passed.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const binDir = join(root, 'resources', 'bin')
const force = process.argv.includes('--force')

const YTDLP = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
const YTDLP_SUMS = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS'
const FFMPEG_NAME = 'ffmpeg-master-latest-win64-lgpl.zip'
const FFMPEG_ZIP = `https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/${FFMPEG_NAME}`
const FFMPEG_SUMS = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/checksums.sha256'

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Raftaaro-build' } })
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

function verify(buf, expected, what) {
  const actual = sha256(buf)
  if (actual !== expected.toLowerCase()) throw new Error(`${what}: checksum mismatch (${actual} != ${expected})`)
  console.log(`${what}: checksum OK`)
}

function findFile(dir, name) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) {
      const hit = findFile(p, name)
      if (hit) return hit
    } else if (entry.toLowerCase() === name) return p
  }
  return null
}

async function fetchYtDlp() {
  const target = join(binDir, 'yt-dlp.exe')
  if (existsSync(target) && !force) return console.log('yt-dlp.exe already present')
  console.log('Downloading yt-dlp.exe…')
  const [exe, sums] = await Promise.all([download(YTDLP), download(YTDLP_SUMS)])
  const line = sums
    .toString('utf8')
    .split('\n')
    .find((l) => l.trim().endsWith(' yt-dlp.exe'))
  if (!line) throw new Error('yt-dlp.exe not listed in SHA2-256SUMS')
  verify(exe, line.trim().split(/\s+/)[0], 'yt-dlp.exe')
  writeFileSync(target, exe)
}

async function fetchFfmpeg() {
  const targets = ['ffmpeg.exe', 'ffprobe.exe'].map((n) => join(binDir, n))
  if (targets.every(existsSync) && !force) return console.log('ffmpeg.exe / ffprobe.exe already present')
  console.log('Downloading FFmpeg (BtbN LGPL build)…')
  const [zip, sums] = await Promise.all([download(FFMPEG_ZIP), download(FFMPEG_SUMS)])
  const line = sums
    .toString('utf8')
    .split('\n')
    .find((l) => l.trim().endsWith(FFMPEG_NAME))
  if (!line) throw new Error(`${FFMPEG_NAME} not listed in checksums.sha256`)
  verify(zip, line.trim().split(/\s+/)[0], 'ffmpeg zip')
  const work = mkdtempSync(join(tmpdir(), 'raftaaro-ffmpeg-'))
  try {
    const zipPath = join(work, 'ffmpeg.zip')
    writeFileSync(zipPath, zip)
    execFileSync('tar', ['-xf', zipPath, '-C', work], { stdio: 'inherit' })
    for (const name of ['ffmpeg.exe', 'ffprobe.exe']) {
      const found = findFile(work, name)
      if (!found) throw new Error(`${name} not found in archive`)
      copyFileSync(found, join(binDir, name))
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

mkdirSync(binDir, { recursive: true })
await fetchYtDlp()
await fetchFfmpeg()
console.log('Binaries ready in resources/bin')
