import type { Job } from '../shared/types'
import { isVideoSiteUrl } from '../shared/links'
import { renderCard, updateCard, type CardHandlers } from './card'
import { esc, openDialog, setBody } from './dialog'
import { showQualityDialog } from './quality-dialog'
import { showPlaylistDialog } from './playlist-dialog'
import { renderSettings } from './settings'

type View = 'all' | 'videos' | 'audio' | 'done' | 'settings'

const list = document.getElementById('list')!
const empty = document.getElementById('empty')!
const settingsEl = document.getElementById('settings')!
const form = document.getElementById('addForm') as HTMLFormElement
const input = document.getElementById('urlInput') as HTMLInputElement

const jobs = new Map<string, Job>()
const cards = new Map<string, HTMLElement>()
let view: View = 'all'

const handlers: CardHandlers = {
  pause: (id) => void window.idm.pause(id),
  resume: (id) => void window.idm.resume(id),
  openFile: (id) => void window.idm.openFile(id),
  openFolder: (id) => void window.idm.openFolder(id),
  remove: (id) => {
    const job = jobs.get(id)
    if (!job) return
    const deleteFile =
      job.status === 'done'
        ? confirm(`"${job.title}" list se hata rahe hain.\n\nKya file bhi delete kar dein?`)
        : true
    void window.idm.remove(id, deleteFile)
  }
}

function visible(job: Job): boolean {
  switch (view) {
    case 'videos':
      return job.kind === 'video' && job.choice?.media !== 'audio'
    case 'audio':
      return job.choice?.media === 'audio'
    case 'done':
      return job.status === 'done'
    default:
      return true
  }
}

function upsert(job: Job): void {
  jobs.set(job.id, job)
  let el = cards.get(job.id)
  if (el) updateCard(el, job)
  else {
    el = renderCard(job, handlers)
    cards.set(job.id, el)
    list.prepend(el)
  }
  el.hidden = !visible(job)
  refreshEmpty()
}

function drop(id: string): void {
  jobs.delete(id)
  cards.get(id)?.remove()
  cards.delete(id)
  refreshEmpty()
}

function refreshEmpty(): void {
  const any = [...cards.values()].some((c) => !c.hidden)
  empty.hidden = view === 'settings' || any
}

function setView(v: View): void {
  view = v
  document.querySelectorAll<HTMLButtonElement>('.nav').forEach((b) => b.classList.toggle('active', b.dataset.view === v))
  list.hidden = v === 'settings'
  settingsEl.hidden = v !== 'settings'
  for (const [id, el] of cards) el.hidden = !visible(jobs.get(id)!)
  refreshEmpty()
  document.dispatchEvent(new CustomEvent('idm:view', { detail: v }))
}

/** Start a download for a link typed, pasted or received: video sites go through the quality dialog. */
export async function startDownload(url: string): Promise<void> {
  if (!isVideoSiteUrl(url)) {
    await window.idm.addFile(url)
    return
  }
  const d = openDialog(`<div class="spinner">⏳ Video ki maloomat li ja rahi hai…</div>`)
  const info = await window.idm.probe(url)
  if (!document.body.contains(d.el)) return // closed while waiting
  if ('error' in info) {
    setBody(
      d,
      `<div class="err">❌ ${esc(info.error)}</div>
       <div class="footer"><button class="ghost" id="dClose">Theek hai</button></div>`
    )
    d.el.querySelector('#dClose')!.addEventListener('click', d.close)
    return
  }
  if (info.kind === 'playlist') await showPlaylistDialog(d, info)
  else await showQualityDialog(d, info)
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const url = input.value.trim()
  if (!url) return
  if (!/^https?:\/\//i.test(url)) {
    alert('Sahi link dalein (http:// ya https:// se shuru hone wala).')
    return
  }
  input.value = ''
  await startDownload(url)
})

document.querySelectorAll<HTMLButtonElement>('.nav').forEach((b) =>
  b.addEventListener('click', () => setView(b.dataset.view as View))
)

document.addEventListener('idm:view', (e) => {
  if ((e as CustomEvent<View>).detail === 'settings') void renderSettings(settingsEl)
})

/** When the window gets focus and the clipboard holds a new link, offer it once. */
const banner = document.getElementById('banner')!
window.addEventListener('focus', async () => {
  const url = await window.idm.readClipboardLink()
  if (!url) return
  banner.innerHTML = `<span>📋 Link mila:</span><span class="url"></span>
    <button class="primary" id="bGo">Download</button><button class="ghost" id="bNo">✕</button>`
  banner.querySelector('.url')!.textContent = url
  banner.hidden = false
  banner.querySelector('#bGo')!.addEventListener('click', () => {
    banner.hidden = true
    void startDownload(url)
  })
  banner.querySelector('#bNo')!.addEventListener('click', () => (banner.hidden = true))
})

window.idm.onUpdate(upsert)
window.idm.onRemoved(drop)
const initial = await window.idm.list()
initial.sort((a, b) => a.createdAt - b.createdAt).forEach(upsert)
refreshEmpty()
