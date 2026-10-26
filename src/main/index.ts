import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { Store } from './store'
import { DownloadQueue, type Runner } from './queue'
import { HttpDownload } from './http/http-download'
import { registerIpc } from './ipc'
import { YtDlpDownload } from './video/ytdlp'
import { binDir, binPath } from './video/bins'
import type { Job } from '../shared/types'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 680,
    minWidth: 760,
    minHeight: 480,
    show: false,
    title: 'IDM-Downloader',
    backgroundColor: '#1e1f26',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => (mainWindow = null))

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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.local.idmdownloader')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const store = new Store(app.getPath('userData'), app.getPath('downloads'))
  const makeRunner = (job: Job): Runner => {
    const settings = store.getSettings()
    if (job.kind === 'video') return new YtDlpDownload(job, settings, { exe: binPath('yt-dlp') }, binDir())
    return new HttpDownload({
      url: job.url,
      dir: settings.folders.files,
      parts: settings.partsPerFile,
      resumePath: job.savePath
    })
  }
  const queue = new DownloadQueue(store, makeRunner)
  registerIpc({ queue, store, window: () => mainWindow })

  createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})
