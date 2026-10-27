// Adds a "⬇ Download" button on Instagram videos (feed posts, reels, single posts).
// Instagram lays transparent play/pause layers over its videos, which swallow clicks on anything placed
// inside the video's box (and hide the right-click "video" menu). So there is one button on the page's top
// layer instead, kept over the corner of whichever video is most visible.
const BTN_CLASS = 'raftaaro-insta-btn'
const POST_PATH = /^\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]+)/
/** Videos smaller than this (previews, avatars) get no button. */
const MIN_SIDE = 150
const MARGIN = 12

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

/** The on-screen part of an element, or null when too little of it is visible. */
function visibleRect(el) {
  const r = el.getBoundingClientRect()
  const left = Math.max(r.left, 0)
  const top = Math.max(r.top, 0)
  const right = Math.min(r.right, innerWidth)
  const bottom = Math.min(r.bottom, innerHeight)
  if (r.width < MIN_SIDE || r.height < MIN_SIDE || right - left < MIN_SIDE || bottom - top < MIN_SIDE) return null
  return { left, top, right, bottom, area: (right - left) * (bottom - top) }
}

let current = null

const btn = document.createElement('button')
btn.className = `raftaaro-btn ${BTN_CLASS}`
btn.textContent = '⬇ Download'
btn.title = 'Download with Raftaaro'
btn.hidden = true
// keep Instagram from treating the click as play/pause or opening the post
for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'touchstart']) {
  btn.addEventListener(type, (e) => e.stopPropagation())
}
btn.addEventListener('click', async (e) => {
  e.preventDefault()
  e.stopPropagation()
  const target = current && urlFor(current)
  if (!target) return toast('Open the post first, then press Download', false)
  btn.disabled = true
  const r = await chrome.runtime.sendMessage({ type: 'add', url: target, title: document.title })
  btn.disabled = false
  toast(r?.ok ? 'Sent to Raftaaro ✅' : r?.error || 'Something went wrong', !!r?.ok)
})

/** Put the button on the top-right corner of the most visible video, or hide it. */
function place() {
  let best = null
  for (const v of document.querySelectorAll('video')) {
    const r = visibleRect(v)
    if (r && (!best || r.area > best.r.area)) best = { v, r }
  }
  current = best?.v ?? null
  if (!best) {
    btn.hidden = true
    return
  }
  if (!btn.isConnected) document.body.appendChild(btn)
  btn.hidden = false
  btn.style.top = `${best.r.top + MARGIN}px`
  btn.style.left = `${best.r.right - btn.offsetWidth - MARGIN}px`
}

// Instagram scrolls inner panels and swaps videos without page loads; follow all of it cheaply
let queued = false
function schedule() {
  if (queued) return
  queued = true
  requestAnimationFrame(() => {
    queued = false
    place()
  })
}
addEventListener('scroll', schedule, { capture: true, passive: true })
addEventListener('resize', schedule)
setInterval(schedule, 400)
schedule()
