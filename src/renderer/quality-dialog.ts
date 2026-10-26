import type { MediaType, QualityOption, VideoInfo } from '../shared/types'
import { formatBytes, formatDuration } from '../shared/format'
import { esc, setBody, type DialogHandle } from './dialog'

/** Fill an open dialog with the quality picker (mockup B) for one video. */
export async function showQualityDialog(d: DialogHandle, info: VideoInfo): Promise<void> {
  const settings = await window.idm.getSettings()
  const meta = [formatDuration(info.durationSec), info.uploader].filter(Boolean).join(' · ')
  setBody(
    d,
    `<div class="head">
       <div class="thumb">${info.thumbnail ? '' : '🎬'}</div>
       <div><b>${esc(info.title)}</b><div class="muted">${esc(meta)}</div></div>
     </div>
     <div class="row">
       <div><label>Qisam</label>
         <select id="qMedia"><option value="video">🎬 Video</option><option value="audio">🎵 Audio</option></select>
       </div>
       <div><label>Quality</label><select id="qQuality"></select></div>
     </div>
     <div class="muted" id="qSize"></div>
     <div class="folder"><span id="qFolder"></span><button class="ghost" id="qPick">Badlein</button></div>
     <div class="footer">
       <button class="ghost" id="qCancel">Cancel</button>
       <button class="primary" id="qGo">⬇ Download</button>
     </div>`
  )
  const $ = <T extends HTMLElement>(id: string): T => d.el.querySelector<T>(`#${id}`)!
  if (info.thumbnail) {
    d.el.querySelector<HTMLElement>('.thumb')!.style.backgroundImage = `url("${info.thumbnail.replace(/"/g, '%22')}")`
  }

  const media = $<HTMLSelectElement>('qMedia')
  const quality = $<HTMLSelectElement>('qQuality')
  let options: QualityOption[] = []
  let folderOverride: string | null = null

  const folder = (): string =>
    folderOverride ?? (media.value === 'audio' ? settings.folders.audio : settings.folders.videos)
  const selected = (): QualityOption => options[Number(quality.value)] ?? options[0]
  const refreshSize = (): void => {
    const est = selected()?.estBytes ?? null
    $('qSize').textContent = `Andazan size: ${est ? formatBytes(est) : 'maloom nahi'}`
  }
  const refreshFolder = (): void => {
    $('qFolder').textContent = `📁 ${folder()}`
  }
  const loadOptions = async (): Promise<void> => {
    options = await window.idm.qualityOptions(info, media.value as MediaType)
    quality.innerHTML = options.map((o, i) => `<option value="${i}">${esc(o.label)}</option>`).join('')
    quality.value = '0'
    refreshSize()
    refreshFolder()
  }

  media.addEventListener('change', () => void loadOptions())
  quality.addEventListener('change', refreshSize)
  $('qPick').addEventListener('click', async () => {
    const picked = await window.idm.pickFolder(folder())
    if (picked) {
      folderOverride = picked
      refreshFolder()
    }
  })
  $('qCancel').addEventListener('click', d.close)
  $('qGo').addEventListener('click', async () => {
    const opt = selected()
    await window.idm.addVideo({
      url: info.url,
      title: info.title,
      thumbnail: info.thumbnail,
      choice: { media: media.value as MediaType, height: opt.value, audioFormat: opt.audioFormat },
      folder: folderOverride ?? undefined,
      estBytes: opt.estBytes
    })
    d.close()
  })
  await loadOptions()
}
