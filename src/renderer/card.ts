import type { Job } from '../shared/types'
import { formatBytes, formatEta } from '../shared/format'

const FILE_ICONS: [RegExp, string][] = [
  [/\.(mp4|mkv|webm|avi|mov|flv)$/i, '🎬'],
  [/\.(mp3|m4a|wav|flac|aac|ogg|opus)$/i, '🎵'],
  [/\.(zip|rar|7z|tar|gz)$/i, '🗜'],
  [/\.(exe|msi)$/i, '📦'],
  [/\.(pdf|docx?|xlsx?|pptx?|txt)$/i, '📄'],
  [/\.(png|jpe?g|gif|webp)$/i, '🖼']
]

function icon(job: Job): string {
  if (job.kind === 'video') return job.choice?.media === 'audio' ? '🎵' : '🎬'
  return FILE_ICONS.find(([re]) => re.test(job.title))?.[1] ?? '📁'
}

function statusLine(job: Job): string {
  const size = job.totalBytes ? formatBytes(job.totalBytes) : ''
  const pct = job.totalBytes ? Math.floor((job.receivedBytes / job.totalBytes) * 100) : null
  switch (job.status) {
    case 'queued':
      return 'Waiting…'
    case 'probing':
      return 'Getting info…'
    case 'merging':
      return 'Joining video and audio…'
    case 'paused':
      return `Paused${pct !== null ? ` · ${pct}%` : ''}${size ? ` · ${size}` : ''}`
    case 'done':
      return `Completed ✅${size ? ` · ${size}` : ''}`
    case 'error':
      return `❌ ${job.error ?? 'Something went wrong'}`
    case 'downloading': {
      const parts = [
        pct !== null ? `${pct}%` : formatBytes(job.receivedBytes),
        size ? `of ${size}` : '',
        job.speedBps ? `${formatBytes(job.speedBps)}/s` : '',
        formatEta(job.etaSec)
      ]
      return parts.filter(Boolean).join(' · ')
    }
  }
}

export interface CardHandlers {
  pause(id: string): void
  resume(id: string): void
  remove(id: string): void
  openFile(id: string): void
  openFolder(id: string): void
}

export function renderCard(job: Job, h: CardHandlers): HTMLElement {
  const el = document.createElement('div')
  el.className = 'card'
  el.dataset.id = job.id
  el.innerHTML = `
    <div class="thumb"></div>
    <div class="info">
      <div class="title"></div>
      <div class="bar"><div></div></div>
      <div class="meta"></div>
    </div>
    <div class="actions">
      <button data-act="toggle"></button>
      <button data-act="folder" title="Open folder">📂</button>
      <button data-act="remove" title="Remove">🗑</button>
    </div>`
  el.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest('button')?.dataset.act
    const id = el.dataset.id!
    const status = el.dataset.status
    if (act === 'toggle') {
      if (status === 'done') h.openFile(id)
      else if (status === 'paused' || status === 'error') h.resume(id)
      else h.pause(id)
    } else if (act === 'folder') h.openFolder(id)
    else if (act === 'remove') h.remove(id)
  })
  el.addEventListener('dblclick', () => el.dataset.status === 'done' && h.openFile(el.dataset.id!))
  updateCard(el, job)
  return el
}

export function updateCard(el: HTMLElement, job: Job): void {
  el.dataset.status = job.status
  el.className = `card ${job.status}`
  const unknownTotal = job.status === 'downloading' && !job.totalBytes
  if (unknownTotal || job.status === 'merging' || job.status === 'probing') el.classList.add('indeterminate')

  const thumb = el.querySelector<HTMLElement>('.thumb')!
  if (job.thumbnail) {
    thumb.style.backgroundImage = `url("${job.thumbnail.replace(/"/g, '%22')}")`
    thumb.textContent = ''
  } else {
    thumb.textContent = icon(job)
  }
  el.querySelector('.title')!.textContent = job.title
  const pct = job.status === 'done' ? 100 : job.totalBytes ? (job.receivedBytes / job.totalBytes) * 100 : 0
  el.querySelector<HTMLElement>('.bar > div')!.style.width = `${Math.min(100, pct)}%`
  el.querySelector('.meta')!.textContent = statusLine(job)

  const toggle = el.querySelector<HTMLButtonElement>('[data-act="toggle"]')!
  if (job.status === 'done') {
    toggle.textContent = '▶'
    toggle.title = 'Open file'
  } else if (job.status === 'paused' || job.status === 'error') {
    toggle.textContent = '⏵'
    toggle.title = job.status === 'error' ? 'Retry' : 'Resume'
  } else {
    toggle.textContent = '⏸'
    toggle.title = 'Pause'
  }
}
