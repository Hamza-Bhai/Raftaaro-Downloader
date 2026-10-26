import type { Settings } from '../shared/types'
import { esc } from './dialog'

type FolderKey = keyof Settings['folders']
const FOLDER_LABELS: [FolderKey, string][] = [
  ['videos', '🎬 Videos folder'],
  ['audio', '🎵 Audio folder'],
  ['files', '📁 Other files folder']
]

/** Render the Settings page into `root`; every change is saved immediately. */
export async function renderSettings(root: HTMLElement): Promise<void> {
  const s = await window.raftaaro.getSettings()
  root.innerHTML = `
    <h2>Settings</h2>
    ${FOLDER_LABELS.map(
      ([k, label]) => `<div class="setting">
        <div class="label">${label}</div>
        <div class="folder" style="margin:0"><span data-folder="${k}">${esc(s.folders[k])}</span>
          <button class="ghost" data-pick="${k}">Change</button></div>
      </div>`
    ).join('')}
    <div class="setting">
      <div class="label">Connections per file</div>
      <input type="number" id="sParts" min="1" max="16" value="${s.partsPerFile}" />
      <div class="hint">1 to 16. More connections usually means faster downloads. Default 8.</div>
    </div>
    <div class="setting">
      <div class="label">Downloads at the same time</div>
      <input type="number" id="sMax" min="1" max="10" value="${s.maxConcurrent}" />
    </div>
    <div class="setting">
      <label class="label"><input type="checkbox" id="sCookies" ${s.useChromeCookies ? 'checked' : ''} />
        Use my Chrome login</label>
      <div class="hint">Needed for sign-in-only videos (Instagram, Facebook, age-restricted YouTube). Your login is only
        used on this computer. If it does not work, close Chrome and try again.</div>
    </div>
    <div class="setting">
      <div class="label">yt-dlp (video engine)</div>
      <button class="ghost" id="sUpdate">Update yt-dlp</button>
      <span class="muted" id="sUpdateMsg"></span>
      <div class="hint">YouTube changes often. If videos stop downloading, update this first.</div>
    </div>
    <div class="setting">
      <div class="label">Chrome extension token</div>
      <code>${esc(s.apiToken)}</code>
      <button class="ghost" id="sCopy">Copy</button>
      <div class="hint">Paste this token into the extension popup.</div>
    </div>`

  const save = (patch: Partial<Settings>): Promise<Settings> => window.raftaaro.saveSettings(patch)

  root.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((b) =>
    b.addEventListener('click', async () => {
      const key = b.dataset.pick as FolderKey
      const span = root.querySelector<HTMLElement>(`[data-folder="${key}"]`)!
      const picked = await window.raftaaro.pickFolder(span.textContent ?? undefined)
      if (!picked) return
      const saved = await save({ folders: { ...s.folders, [key]: picked } })
      s.folders = saved.folders
      span.textContent = saved.folders[key]
    })
  )
  const numberField = (id: string, key: 'partsPerFile' | 'maxConcurrent'): void => {
    const el = root.querySelector<HTMLInputElement>(`#${id}`)!
    el.addEventListener('change', async () => {
      const saved = await save({ [key]: Number(el.value) })
      el.value = String(saved[key])
    })
  }
  numberField('sParts', 'partsPerFile')
  numberField('sMax', 'maxConcurrent')
  root.querySelector<HTMLInputElement>('#sCookies')!.addEventListener('change', (e) => {
    void save({ useChromeCookies: (e.target as HTMLInputElement).checked })
  })
  root.querySelector('#sUpdate')!.addEventListener('click', async () => {
    const msg = root.querySelector('#sUpdateMsg')!
    msg.textContent = ' Updating…'
    const r = await window.raftaaro.updateYtDlp()
    msg.textContent = 'version' in r ? ` ✅ Version: ${r.version}` : ` ❌ ${r.error}`
  })
  root.querySelector('#sCopy')!.addEventListener('click', async (e) => {
    await navigator.clipboard.writeText(s.apiToken)
    ;(e.target as HTMLButtonElement).textContent = 'Copied ✅'
  })
}
