const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

export function formatBytes(n: number | null): string {
  if (n === null) return '?'
  let i = 0
  let v = n
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024
    i++
  }
  if (i === 0) return `${v} B`
  return `${v.toFixed(i >= 3 ? 2 : 1)} ${UNITS[i]}`
}

export function formatEta(sec: number | null): string {
  if (sec === null) return ''
  if (sec < 60) return `${Math.round(sec)} sec left`
  if (sec < 3600) return `${Math.round(sec / 60)} min left`
  return `${Math.round(sec / 3600)} hr left`
}

export function formatDuration(sec: number | null): string {
  if (sec === null) return ''
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
