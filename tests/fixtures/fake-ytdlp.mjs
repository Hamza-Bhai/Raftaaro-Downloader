// Stand-in for yt-dlp.exe in tests: prints a fixture chosen from the URL and records argv.
// With --progress-template it simulates a download: progress for two streams, a merge, then the final path.
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
if (process.env.FAKE_YTDLP_LOG) appendFileSync(process.env.FAKE_YTDLP_LOG, JSON.stringify(args) + '\n')
const url = args[args.length - 1]

if (process.env.FAKE_COOKIE_FAIL && args.includes('--cookies-from-browser')) {
  process.stderr.write(
    'ERROR: Could not copy Chrome cookie database. See  https://github.com/yt-dlp/yt-dlp/issues/7271  for more info\n'
  )
  process.exit(1)
}

if (args.includes('--progress-template')) {
  const out = process.env.FAKE_YTDLP_OUT
  if (process.env.FAKE_YTDLP_EXISTING) {
    // yt-dlp found the file from an earlier run: no progress and (in some versions) no after_move print
    writeFileSync(out, Buffer.alloc(10))
    process.stdout.write(`[download] ${out} has already been downloaded\n`)
    process.exit(0)
  }
  // FAKE_YTDLP_SIZE: the before_dl print of the chosen formats' total size ("NA" when unknown)
  const size = process.env.FAKE_YTDLP_SIZE ? [`RFTSIZE ${process.env.FAKE_YTDLP_SIZE}`] : []
  // FAKE_YTDLP_RESUME: the video stream finished in an earlier run, so only the audio is fetched now
  let video = [
    '[download] Destination: v.f1.mp4',
    'RFTP 500 1000 NA 100 5',
    'RFTP 1000 1000 NA 100 0'
  ]
  if (process.env.FAKE_YTDLP_RESUME) {
    const part = join(dirname(out), 'v.f1.mp4')
    writeFileSync(part, Buffer.alloc(1000))
    video = [`[download] ${part} has already been downloaded`]
  }
  const lines = [
    ...size,
    ...video,
    '[download] Sleeping 3.00 seconds ...',
    '[download] Destination: v.f2.m4a',
    'RFTP 200 400 NA 100 2',
    '[Merger] Merging formats into "v.mp4"'
  ]
  for (const l of lines) process.stdout.write(l + '\n')
  writeFileSync(out, Buffer.alloc(1234))
  process.stdout.write('RFTFILE:' + out + '\n')
  process.exit(0)
}

if (url.includes('fail')) {
  process.stderr.write("ERROR: [youtube] xyz: Private video. Sign in if you've been granted access to this video\n")
  process.exit(1)
}
const name = url.endsWith('/@chan') ? 'raw-channel.json' : url.includes('list=') ? 'raw-playlist.json' : 'raw-video.json'
let text = readFileSync(join(here, name), 'utf8')
if (url.endsWith('/videos')) text = readFileSync(join(here, 'raw-playlist.json'), 'utf8')
process.stdout.write(text)
