import type { AudioFormat, MediaType, PlaylistInfo } from '../shared/types'
import { formatDuration } from '../shared/format'
import { clampedTitle, esc, setBody, type DialogHandle } from './dialog'

const VIDEO_QUALITIES: { value: number | 'best'; label: string }[] = [
  { value: 'best', label: '⭐ Best' },
  { value: 2160, label: '2160p (4K)' },
  { value: 1440, label: '1440p (2K)' },
  { value: 1080, label: '1080p' },
  { value: 720, label: '720p' },
  { value: 480, label: '480p' },
  { value: 360, label: '360p' }
]
const AUDIO_QUALITIES: { value: AudioFormat; label: string }[] = [
  { value: 'mp3', label: 'MP3' },
  { value: 'm4a', label: 'M4A' }
]

/** Fill an open dialog with the playlist / channel picker: tick videos, pick one quality for all. */
export async function showPlaylistDialog(d: DialogHandle, info: PlaylistInfo): Promise<void> {
  setBody(
    d,
    `${clampedTitle(info.title)}
     <div class="muted">${info.entries.length} videos</div>
     <label style="margin-top:10px"><input type="checkbox" id="pAll" checked /> Select all</label>
     <div class="entries">
       ${info.entries
         .map(
           (e, i) => `<label><input type="checkbox" data-i="${i}" checked />
             <span>${esc(e.title)}</span><span class="dur">${formatDuration(e.durationSec)}</span></label>`
         )
         .join('')}
     </div>
     <div class="row">
       <div><label>Type</label>
         <select id="pMedia"><option value="video">🎬 Video</option><option value="audio">🎵 Audio</option></select>
       </div>
       <div><label>Quality</label><select id="pQuality"></select></div>
     </div>
     <div class="muted">If a video is not available in this quality, the closest one is used.</div>
     <div class="footer" style="margin-top:12px">
       <button class="ghost" id="pCancel">Cancel</button>
       <button class="primary" id="pGo"></button>
     </div>`
  )
  const $ = <T extends HTMLElement>(id: string): T => d.el.querySelector<T>(`#${id}`)!
  const boxes = [...d.el.querySelectorAll<HTMLInputElement>('.entries input')]
  const media = $<HTMLSelectElement>('pMedia')
  const quality = $<HTMLSelectElement>('pQuality')
  const go = $<HTMLButtonElement>('pGo')

  const fillQuality = (): void => {
    const list = media.value === 'audio' ? AUDIO_QUALITIES : VIDEO_QUALITIES
    quality.innerHTML = list.map((q, i) => `<option value="${i}">${q.label}</option>`).join('')
  }
  const refreshCount = (): void => {
    const n = boxes.filter((b) => b.checked).length
    go.textContent = `⬇ Download (${n})`
    go.disabled = n === 0
    $<HTMLInputElement>('pAll').checked = n === boxes.length
  }

  $<HTMLInputElement>('pAll').addEventListener('change', (e) => {
    const on = (e.target as HTMLInputElement).checked
    boxes.forEach((b) => (b.checked = on))
    refreshCount()
  })
  boxes.forEach((b) => b.addEventListener('change', refreshCount))
  media.addEventListener('change', fillQuality)
  $('pCancel').addEventListener('click', d.close)
  go.addEventListener('click', async () => {
    const m = media.value as MediaType
    const i = Number(quality.value)
    const choice =
      m === 'audio'
        ? { media: m, height: 'best' as const, audioFormat: AUDIO_QUALITIES[i].value }
        : { media: m, height: VIDEO_QUALITIES[i].value }
    const entries = boxes.filter((b) => b.checked).map((b) => info.entries[Number(b.dataset.i)])
    await window.raftaaro.addPlaylist({ title: info.title, entries, choice })
    d.close()
  })
  fillQuality()
  refreshCount()
}
