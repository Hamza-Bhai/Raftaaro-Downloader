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
  wireClamps(d.el)
}

/**
 * A title cut to two lines with a "See more" toggle. Some sites (Facebook) give a whole post's text
 * as the video title, which would otherwise fill the dialog.
 */
export function clampedTitle(text: string): string {
  return `<div class="clamp"><b class="clamp-text">${esc(text)}</b><button class="link clamp-toggle" hidden>See more</button></div>`
}

/** Show the toggle only where the text really is cut. */
function wireClamps(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.clamp').forEach((box) => {
    const text = box.querySelector<HTMLElement>('.clamp-text')!
    const toggle = box.querySelector<HTMLButtonElement>('.clamp-toggle')!
    toggle.hidden = text.scrollHeight <= text.clientHeight + 1
    toggle.addEventListener('click', () => {
      const open = box.classList.toggle('open')
      toggle.textContent = open ? 'See less' : 'See more'
    })
  })
}
