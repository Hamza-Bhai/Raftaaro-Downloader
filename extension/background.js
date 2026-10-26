// Sends links to the IDM-Downloader desktop app over its loopback API.
const API = 'http://127.0.0.1:47821'

async function token() {
  const { token } = await chrome.storage.local.get('token')
  return token || ''
}

/** POST a link to the app. Resolves { ok: true } or { error: string }. */
async function sendToApp(url, title) {
  const t = await token()
  if (!t) return { error: 'Token set nahi — extension icon par click karke token paste karein.' }
  try {
    const res = await fetch(`${API}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-IDM-Token': t },
      body: JSON.stringify({ url, title })
    })
    if (res.status === 202) return { ok: true }
    if (res.status === 401) return { error: 'Token galat hai — app ki Settings se dobara copy karein.' }
    return { error: `App ne link qubool nahi kiya (${res.status}).` }
  } catch {
    return { error: 'IDM-Downloader app khulain, phir dobara koshish karein.' }
  }
}

async function ping(t) {
  try {
    const res = await fetch(`${API}/ping`, { headers: { 'X-IDM-Token': t } })
    if (res.status === 200) return { ok: true }
    if (res.status === 401) return { error: 'Token galat hai.' }
    return { error: `Jawab: ${res.status}` }
  } catch {
    return { error: 'App nahi mili — IDM-Downloader khulain.' }
  }
}

function flashBadge(ok) {
  chrome.action.setBadgeBackgroundColor({ color: ok ? '#22c55e' : '#ef4444' })
  chrome.action.setBadgeText({ text: ok ? '✓' : '!' })
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 4000)
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'idm-link', title: 'Download with IDM-Downloader', contexts: ['link'] })
  chrome.contextMenus.create({ id: 'idm-media', title: 'Download with IDM-Downloader', contexts: ['video', 'audio'] })
  chrome.contextMenus.create({ id: 'idm-page', title: 'Is page ki video IDM-Downloader se download karein', contexts: ['page'] })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let url = info.linkUrl || info.pageUrl || tab?.url
  // a <video> src is often a blob: url; the page url is what yt-dlp understands
  if (info.menuItemId === 'idm-media') url = /^https?:/.test(info.srcUrl || '') ? info.srcUrl : info.pageUrl
  if (!url) return
  const r = await sendToApp(url, tab?.title)
  flashBadge(!!r.ok)
})

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'add') sendToApp(msg.url, msg.title).then(reply)
  else if (msg?.type === 'ping') ping(msg.token).then(reply)
  else return false
  return true // reply asynchronously
})
