// Sends links to the Raftaaro desktop app over its loopback API.
const API = 'http://127.0.0.1:47821'

async function token() {
  const { token } = await chrome.storage.local.get('token')
  return token || ''
}

/** POST a link to the app. Resolves { ok: true } or { error: string }. */
async function sendToApp(url, title) {
  const t = await token()
  if (!t) return { error: 'No token set — click the extension icon and paste the token from the app.' }
  try {
    const res = await fetch(`${API}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Raftaaro-Token': t },
      body: JSON.stringify({ url, title })
    })
    if (res.status === 202) return { ok: true }
    if (res.status === 401) return { error: 'Wrong token — copy it again from the app Settings.' }
    return { error: `The app did not accept the link (${res.status}).` }
  } catch {
    return { error: 'Open the Raftaaro app, then try again.' }
  }
}

async function ping(t) {
  try {
    const res = await fetch(`${API}/ping`, { headers: { 'X-Raftaaro-Token': t } })
    if (res.status === 200) return { ok: true }
    if (res.status === 401) return { error: 'Wrong token.' }
    return { error: `Jawab: ${res.status}` }
  } catch {
    return { error: 'App not found — open Raftaaro.' }
  }
}

function flashBadge(ok) {
  chrome.action.setBadgeBackgroundColor({ color: ok ? '#22c55e' : '#ef4444' })
  chrome.action.setBadgeText({ text: ok ? '✓' : '!' })
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 4000)
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'raftaaro-link', title: 'Download with Raftaaro', contexts: ['link'] })
  chrome.contextMenus.create({ id: 'raftaaro-media', title: 'Download with Raftaaro', contexts: ['video', 'audio'] })
  chrome.contextMenus.create({ id: 'raftaaro-page', title: 'Download this page video with Raftaaro', contexts: ['page'] })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let url = info.linkUrl || info.pageUrl || tab?.url
  // a <video> src is often a blob: url; the page url is what yt-dlp understands
  if (info.menuItemId === 'raftaaro-media') url = /^https?:/.test(info.srcUrl || '') ? info.srcUrl : info.pageUrl
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
