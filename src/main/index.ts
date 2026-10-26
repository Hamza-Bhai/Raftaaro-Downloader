import { app, shell, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { Store } from './store'
import { DownloadQueue, type Runner } from './queue'
import { HttpDownload } from './http/http-download'
import { registerIpc } from './ipc'
import { LOCAL_API_PORT, startLocalApi } from './local-api'
import { YtDlpDownload, type YtDlpExec } from './video/ytdlp'
import { toNetscapeCookies } from './video/cookies'
import { writeFileSync } from 'node:fs'
import { binDir, binPath, updateYtDlp } from './video/bins'
import { shouldUpdateYtDlp } from './video/update-policy'
import type { Job } from '../shared/types'
import iconPath from '../../resources/icon.png?asset'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let queue: DownloadQueue | null = null
let quitting = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 680,
    minWidth: 760,
    minHeight: 480,
    show: false,
    title: 'Raftaaro',
    icon: iconPath,
    backgroundColor: '#1e1f26',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => (mainWindow = null))
  // closing while downloads run keeps the app alive in the tray
  mainWindow.on('close', (e) => {
    if (quitting || !queue || queue.activeCount() === 0) return
    e.preventDefault()
    mainWindow?.hide()
    showTray()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function showWindow(): BrowserWindow {
  if (!mainWindow) createWindow()
  const win = mainWindow!
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  return win
}

function refreshTrayTooltip(): void {
  const n = queue?.activeCount() ?? 0
  tray?.setToolTip(n ? `Raftaaro — ${n} download${n === 1 ? '' : 's'} running` : 'Raftaaro')
}

function showTray(): void {
  if (!tray) {
    tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }))
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open Raftaaro', click: () => showWindow() },
        {
          label: 'Quit',
          click: () => {
            quitting = true
            app.quit()
          }
        }
      ])
    )
    tray.on('click', () => showWindow())
  }
  refreshTrayTooltip()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.local.raftaaro')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    const store = new Store(app.getPath('userData'), app.getPath('downloads'))
    const ytExec: YtDlpExec = {
      exe: binPath('yt-dlp'),
      nodePath: process.execPath,
      cookieFile: join(app.getPath('userData'), 'youtube-cookies.txt')
    }
    const makeRunner = (job: Job): Runner => {
      const settings = store.getSettings()
      if (job.kind === 'video') {
        return new YtDlpDownload(job, settings, ytExec, binDir())
      }
      return new HttpDownload({
        url: job.url,
        dir: settings.folders.files,
        parts: settings.partsPerFile,
        resumePath: job.savePath
      })
    }
    // an old yt-dlp is the most common reason YouTube stops working or flags the network
    if (shouldUpdateYtDlp(store.getSettings().lastYtDlpUpdate, Date.now())) {
      updateYtDlp()
        .then(() => store.saveSettings({ lastYtDlpUpdate: Date.now() }))
        .catch((e: Error) => console.error(`yt-dlp update failed: ${e.message}`))
    }
    queue = new DownloadQueue(store, makeRunner)
    queue.on('update', refreshTrayTooltip)
    registerIpc({ queue, store, window: () => mainWindow, ytExec })

    createWindow()

    startLocalApi({
      // RAFTAARO_API_PORT lets a second copy (development, tests) run next to the installed app
      port: Number(process.env.RAFTAARO_API_PORT) || LOCAL_API_PORT,
      token: store.getSettings().apiToken,
      onLink: (url, _title, cookies) => {
        // keep the user's YouTube login (sent by the extension) so YouTube sees a signed-in user, not a bot
        if (cookies?.length && store.getSettings().useExtensionLogin) {
          writeFileSync(ytExec.cookieFile!, toNetscapeCookies(cookies))
        }
        const win = showWindow()
        const deliver = (): void => win.webContents.send('link:incoming', url)
        if (win.webContents.isLoading()) win.webContents.once('did-finish-load', deliver)
        else deliver()
      }
    }).catch((e: Error) => console.error(`Local API not started on port ${LOCAL_API_PORT}: ${e.message}`))
  })

  app.on('before-quit', () => {
    quitting = true
    // stop yt-dlp/ffmpeg children so nothing keeps downloading after the app is gone
    queue?.pauseAll()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
