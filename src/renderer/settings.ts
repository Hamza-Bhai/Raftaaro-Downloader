import type { Settings } from '../shared/types'
import { esc } from './dialog'

type FolderKey = keyof Settings['folders']
const FOLDER_LABELS: [FolderKey, string][] = [
  ['videos', '🎬 Videos ka folder'],
  ['audio', '🎵 Audio ka folder'],
  ['files', '📁 Baqi files ka folder']
]

/** Render the Settings page into `root`; every change is saved immediately. */
export async function renderSettings(root: HTMLElement): Promise<void> {
  const s = await window.idm.getSettings()
  root.innerHTML = `
    <h2>Settings</h2>
    ${FOLDER_LABELS.map(
      ([k, label]) => `<div class="setting">
        <div class="label">${label}</div>
        <div class="folder" style="margin:0"><span data-folder="${k}">${esc(s.folders[k])}</span>
          <button class="ghost" data-pick="${k}">Badlein</button></div>
      </div>`
    ).join('')}
    <div class="setting">
      <div class="label">Ek file kitne hisson mein download ho</div>
      <input type="number" id="sParts" min="1" max="16" value="${s.partsPerFile}" />
      <div class="hint">1 se 16. Zyada hisse = aksar zyada tez (IDM jaisa). Default 8.</div>
    </div>
    <div class="setting">
      <div class="label">Ek waqt mein kitne downloads chalein</div>
      <input type="number" id="sMax" min="1" max="10" value="${s.maxConcurrent}" />
    </div>
    <div class="setting">
      <label class="label"><input type="checkbox" id="sCookies" ${s.useChromeCookies ? 'checked' : ''} />
        Chrome login use karein</label>
      <div class="hint">Instagram / Facebook ki login wali videos ke liye. Aap ka login sirf isi computer par istemal hota hai.
        Agar kaam na kare to Chrome band karke dobara koshish karein.</div>
    </div>
    <div class="setting">
      <div class="label">yt-dlp (video engine)</div>
      <button class="ghost" id="sUpdate">yt-dlp update karein</button>
      <span class="muted" id="sUpdateMsg"></span>
      <div class="hint">YouTube aksar badalta hai. Agar videos download na hon to pehle yeh update karein.</div>
    </div>
    <div class="setting">
      <div class="label">Chrome extension ka token</div>
      <code>${esc(s.apiToken)}</code>
      <button class="ghost" id="sCopy">Copy</button>
      <div class="hint">Extension ke popup mein yeh token paste karein.</div>
    </div>`

  const save = (patch: Partial<Settings>): Promise<Settings> => window.idm.saveSettings(patch)

  root.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((b) =>
    b.addEventListener('click', async () => {
      const key = b.dataset.pick as FolderKey
      const span = root.querySelector<HTMLElement>(`[data-folder="${key}"]`)!
      const picked = await window.idm.pickFolder(span.textContent ?? undefined)
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
    msg.textContent = ' Update ho raha hai…'
    const r = await window.idm.updateYtDlp()
    msg.textContent = 'version' in r ? ` ✅ Version: ${r.version}` : ` ❌ ${r.error}`
  })
  root.querySelector('#sCopy')!.addEventListener('click', async (e) => {
    await navigator.clipboard.writeText(s.apiToken)
    ;(e.target as HTMLButtonElement).textContent = 'Copied ✅'
  })
}
