const input = document.getElementById('token')
const msg = document.getElementById('msg')

chrome.storage.local.get('token').then(({ token }) => (input.value = token || ''))

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.local.set({ token: input.value.trim() })
  msg.textContent = 'Save ho gaya ✅'
})

document.getElementById('test').addEventListener('click', async () => {
  msg.textContent = 'Check ho raha hai…'
  const r = await chrome.runtime.sendMessage({ type: 'ping', token: input.value.trim() })
  msg.textContent = r?.ok ? 'App se rabta ho gaya ✅' : `❌ ${r?.error || 'Masla'}`
})
