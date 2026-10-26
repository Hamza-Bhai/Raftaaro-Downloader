// Adds a "⬇ Download" button next to YouTube's like/share buttons.
const BTN_ID = 'idm-download-btn'

function videoUrl() {
  const u = new URL(location.href)
  if (u.pathname === '/watch' && u.searchParams.get('v')) return `https://www.youtube.com/watch?v=${u.searchParams.get('v')}`
  if (u.pathname.startsWith('/shorts/')) return u.origin + u.pathname
  return null
}

function toast(text, ok) {
  const t = document.createElement('div')
  t.className = `idm-toast ${ok ? 'ok' : 'err'}`
  t.textContent = text
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 4000)
}

function inject() {
  const url = videoUrl()
  const existing = document.getElementById(BTN_ID)
  if (!url) return existing?.remove()
  if (existing) return
  const bar =
    document.querySelector('ytd-watch-metadata #top-level-buttons-computed') ||
    document.querySelector('#actions #top-level-buttons-computed') ||
    document.querySelector('ytd-reel-player-overlay-renderer #actions')
  if (!bar) return
  const btn = document.createElement('button')
  btn.id = BTN_ID
  btn.className = 'idm-btn'
  btn.textContent = '⬇ Download'
  btn.title = 'IDM-Downloader se download karein'
  btn.addEventListener('click', async (e) => {
    e.preventDefault()
    e.stopPropagation()
    const target = videoUrl()
    if (!target) return
    btn.disabled = true
    const r = await chrome.runtime.sendMessage({ type: 'add', url: target, title: document.title })
    btn.disabled = false
    toast(r?.ok ? 'IDM-Downloader mein bhej diya ✅' : r?.error || 'Masla aa gaya', !!r?.ok)
  })
  bar.prepend(btn)
}

// YouTube is a single-page app: re-check after its own navigations and while the page builds
document.addEventListener('yt-navigate-finish', () => setTimeout(inject, 300))
new MutationObserver(() => inject()).observe(document.documentElement, { childList: true, subtree: true })
inject()
