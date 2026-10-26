import { BrowserWindow, ipcMain, shell } from 'electron'
import { dirname } from 'node:path'
import { existsSync, statSync } from 'node:fs'
import type { Job } from '../shared/types'
import type { DownloadQueue } from './queue'
import type { Store } from './store'

export interface IpcDeps {
  queue: DownloadQueue
  store: Store
  window: () => BrowserWindow | null
}

function titleFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop()
    return last ? decodeURIComponent(last) : new URL(url).hostname
  } catch {
    return url
  }
}

/** Adds a plain-file download to the queue. Shared by the IPC handler and the local API. */
export function addFileJob(deps: IpcDeps, url: string): Job {
  return deps.queue.add({
    kind: 'file',
    url,
    title: titleFromUrl(url),
    savePath: deps.store.getSettings().folders.files,
    totalBytes: null
  })
}

export function registerIpc(deps: IpcDeps): void {
  const { queue } = deps
  const send = (channel: string, payload: unknown): void => deps.window()?.webContents.send(channel, payload)
  queue.on('update', (job: Job) => send('jobs:update', job))
  queue.on('removed', (id: string) => send('jobs:removed', id))

  const job = (id: string): Job | undefined => queue.list().find((j) => j.id === id)

  ipcMain.handle('jobs:list', () => queue.list())
  ipcMain.handle('jobs:addFile', (_e, url: string) => addFileJob(deps, url))
  ipcMain.handle('jobs:pause', (_e, id: string) => queue.pause(id))
  ipcMain.handle('jobs:resume', (_e, id: string) => queue.resume(id))
  ipcMain.handle('jobs:remove', (_e, id: string, deleteFile: boolean) => queue.remove(id, deleteFile))
  ipcMain.handle('jobs:openFile', async (_e, id: string) => {
    const j = job(id)
    if (j && j.status === 'done' && existsSync(j.savePath)) await shell.openPath(j.savePath)
  })
  ipcMain.handle('jobs:openFolder', async (_e, id: string) => {
    const j = job(id)
    if (!j) return
    if (j.status === 'done' && existsSync(j.savePath)) return shell.showItemInFolder(j.savePath)
    const isDir = existsSync(j.savePath) && statSync(j.savePath).isDirectory()
    await shell.openPath(isDir ? j.savePath : dirname(j.savePath))
  })
}
