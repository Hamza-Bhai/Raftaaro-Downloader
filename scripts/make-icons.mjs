// Draws the app icon (blue rounded square, white download arrow) as PNGs without any image library.
// Writes extension/icon{16,48,128}.png and build/icon.png (256px, used by electron-builder).
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y)
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** Coverage of the icon shape at a point in unit coordinates (0..1). 0 = outside, 1 = blue, 2 = white. */
function shape(u, v) {
  const r = 0.2
  const cx = Math.min(Math.max(u, r), 1 - r)
  const cy = Math.min(Math.max(v, r), 1 - r)
  if ((u - cx) ** 2 + (v - cy) ** 2 > r * r) return 0
  const stem = Math.abs(u - 0.5) < 0.09 && v > 0.18 && v < 0.55
  const head = v >= 0.5 && v < 0.72 && Math.abs(u - 0.5) < (0.72 - v) * 1.15
  const tray = v > 0.78 && v < 0.86 && u > 0.22 && u < 0.78
  return stem || head || tray ? 2 : 1
}

function render(size) {
  const S = 4 // supersampling for smooth edges
  return png(size, (x, y) => {
    let blue = 0
    let white = 0
    for (let i = 0; i < S; i++)
      for (let j = 0; j < S; j++) {
        const s = shape((x + (i + 0.5) / S) / size, (y + (j + 0.5) / S) / size)
        if (s === 1) blue++
        else if (s === 2) white++
      }
    const cover = (blue + white) / (S * S)
    if (cover === 0) return [0, 0, 0, 0]
    const w = white / (blue + white)
    const mix = (a, b) => Math.round(a * (1 - w) + b * w)
    return [mix(0x3b, 255), mix(0x82, 255), mix(0xf6, 255), Math.round(cover * 255)]
  })
}

for (const s of [16, 48, 128]) writeFileSync(join(root, 'extension', `icon${s}.png`), render(s))
writeFileSync(join(root, 'build', 'icon.png'), render(256))
console.log('Icons written')
