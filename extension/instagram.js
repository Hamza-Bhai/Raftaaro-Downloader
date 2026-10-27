// Adds a "⬇ Download" button on every Instagram video (feed posts, reels, single posts).
// Instagram lays transparent layers over its videos, so Chrome's right-click "video" menu never shows there.
const BTN_CLASS = 'raftaaro-insta-btn'
const POST_PATH = /^\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]+)/

function toast(text, ok) {
  const t = document.createElement('div')
  t.className = `raftaaro-toast ${ok ? 'ok' : 'err'}`
  t.textContent = text
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 4000)
}

/** A clean post URL yt-dlp understands, e.g. https://www.instagram.com/reel/ABC/ */
function postUrl(path) {
  const m = POST_PATH.exec(path)
  if (!m) return null
  return `https://www.instagram.com/${m[1] === 'reels' ? 'reel' : m[1]}/${m[2]}/`
}

/** The post a video belongs to: its feed card's own link, else the page itself (reel or post page). */
function urlFor(video) {
  const card = video.closest('article')
  for (const a of card ? card.querySelectorAll('a[href]') : []) {
    const url = postUrl(new URL(a.href, location.origin).pathname)
    if (url) return url
  }
  return postUrl(location.pathname)
}

function addButton(video) {
  const box = video.parentElement
  if (!box || box.querySelector(`.${BTN_CLASS}`)) return
  if (getComputedStyle(box).position === 'static') box.style.position = 'relative'
  const btn = document.createElement('button')
  btn.className = `raftaaro-btn ${BTN_CLASS}`
  btn.textContent = '⬇ Download'
  btn.title = 'Download with Raftaaro'
  // keep Instagram from treating the click as play/pause or opening the post
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
    btn.addEventListener(type, (e) => e.stopPropagation())
  }
  btn.addEventListener('click', async (e) => {
    e.preventDefault()
    e.stopPropagation()
    const target = urlFor(video)
    if (!target) return toast('Open the post first, then press Download', false)
    btn.disabled = true
    const r = await chrome.runtime.sendMessage({ type: 'add', url: target, title: document.title })
    btn.disabled = false
    toast(r?.ok ? 'Sent to Raftaaro ✅' : r?.error || 'Something went wrong', !!r?.ok)
  })
  box.appendChild(btn)
}

function scan() {
  document.querySelectorAll('video').forEach(addButton)
}

// Instagram is a single-page app that adds videos while you scroll
let queued = false
new MutationObserver(() => {
  if (queued) return
  queued = true
  setTimeout(() => {
    queued = false
    scan()
  }, 500)
}).observe(document.documentElement, { childList: true, subtree: true })
scan()
