/** Small helpers shared by the quality and playlist dialogs. */

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

export interface DialogHandle {
  el: HTMLElement
  close(): void
}

/** Open a modal; it closes on Escape, on a click outside, or via `close()`. */
export function openDialog(html: string): DialogHandle {
  const root = document.getElementById('dialogRoot')!
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  overlay.innerHTML = `<div class="dialog">${html}</div>`
  root.appendChild(overlay)
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }
  const close = (): void => {
    document.removeEventListener('keydown', onKey)
    overlay.remove()
  }
  overlay.addEventListener('mousedown', (e) => e.target === overlay && close())
  document.addEventListener('keydown', onKey)
  return { el: overlay.querySelector('.dialog')!, close }
}

export function setBody(d: DialogHandle, html: string): void {
  d.el.innerHTML = html
}
