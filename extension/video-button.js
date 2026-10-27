// Adds a "⬇ Download" button on Instagram and Facebook videos (feed posts, reels, single posts).
// Both sites lay transparent play/pause layers over their videos, which swallow clicks on anything placed
// inside the video's box (and hide the right-click "video" menu). So there is one button on the page's top
// layer instead, kept over the corner of whichever video is most visible.
const BTN_CLASS = 'raftaaro-video-btn'
/** Videos smaller than this (previews, avatars) get no button. */
const MIN_SIDE = 150
const MARGIN = 12
/** How far up from a video to look for the link of the post it belongs to. */
const MAX_DEPTH = 25

const INSTAGRAM_POST = /^\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]+)/

/** A clean Instagram post URL yt-dlp understands, e.g. https://www.instagram.com/reel/ABC/ */
function instagramUrl(url) {
  const m = INSTAGRAM_POST.exec(url.pathname)
  if (!m) return null
  return { url: `https://www.instagram.com/${m[1] === 'reels' ? 'reel' : m[1]}/${m[2]}/`, rank: 0 }
}

/**
 * A Facebook video URL yt-dlp understands. Rank 0 is surely a video (watch, reel, videos, share);
 * rank 1 is a post, which yt-dlp can still read when it holds a video.
 */
function facebookUrl(url) {
  const path = url.pathname
  const v = url.searchParams.get('v')
  if (/^\/watch\/?$/.test(path) && v) return { url: `https://www.facebook.com/watch/?v=${v}`, rank: 0 }
  if (/^\/reel\/\d+/.test(path) || /\/videos\/(?:[^/]+\/)?\d+/.test(path) || /^\/share\/[vr]\//.test(path)) {
    return { url: `https://www.facebook.com${path}`, rank: 0 }
  }
  if (/\/posts\/[\w-]+/.test(path)) return { url: `https://www.facebook.com${path}`, rank: 1 }
  const story = url.searchParams.get('story_fbid')
  if (/^\/(permalink|story)\.php$/.test(path) && story) {
    return {
      url: `https://www.facebook.com${path}?story_fbid=${story}&id=${url.searchParams.get('id') ?? ''}`,
      rank: 1
    }
  }
  return null
}

const linkOf = location.hostname.endsWith('instagram.com') ? instagramUrl : facebookUrl

/** The best video link among `anchors`, or null. */
function bestLink(anchors) {
  let best = null
  for (const a of anchors) {
    let found = null
    try {
      found = linkOf(new URL(a.getAttribute('href'), location.origin))
    } catch {
      // not a usable href (e.g. "#")
    }
    if (found && (!best || found.rank < best.rank)) best = found
    if (best?.rank === 0) break
  }
  return best
}

/** The post a video belongs to: the nearest surely-a-video link around it, else the page itself. */
function urlFor(video) {
  let post = null
  let el = video.parentElement
  for (let depth = 0; el && el !== document.body && depth < MAX_DEPTH; depth++, el = el.parentElement) {
    const found = bestLink(el.querySelectorAll('a[href]'))
    if (found?.rank === 0) return found.url
    post = post ?? found
  }
  const page = linkOf(new URL(location.href))
  if (page?.rank === 0) return page.url
  return post?.url ?? page?.url ?? null
}

function toast(text, ok) {
  const t = document.createElement('div')
  t.className = `raftaaro-toast ${ok ? 'ok' : 'err'}`
  t.textContent = text
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 4000)
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
// keep the site from treating the click as play/pause or opening the post
for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'touchstart']) {
  btn.addEventListener(type, (e) => e.stopPropagation())
}
btn.addEventListener('click', async (e) => {
  e.preventDefault()
  e.stopPropagation()
  const target = current && urlFor(current)
  if (!target) return toast('Open the video first (click its date or time), then press Download', false)
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

// these sites scroll inner panels and swap videos without page loads; follow all of it cheaply
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
