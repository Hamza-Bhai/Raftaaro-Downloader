import type { PlaylistInfo } from '../shared/types'
import { esc, setBody, type DialogHandle } from './dialog'

/** Placeholder until the playlist picker lands (Task 6). */
export async function showPlaylistDialog(d: DialogHandle, info: PlaylistInfo): Promise<void> {
  setBody(
    d,
    `<b>${esc(info.title)}</b><div class="muted">${info.entries.length} videos</div>
     <div class="footer"><button class="ghost" id="pClose">Theek hai</button></div>`
  )
  d.el.querySelector('#pClose')!.addEventListener('click', d.close)
}
