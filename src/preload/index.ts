import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Job } from '../shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

/** The typed bridge the renderer uses to talk to the main process. */
const idm = {
  list: (): Promise<Job[]> => ipcRenderer.invoke('jobs:list'),
  addFile: (url: string): Promise<Job> => ipcRenderer.invoke('jobs:addFile', url),
  pause: (id: string): Promise<void> => ipcRenderer.invoke('jobs:pause', id),
  resume: (id: string): Promise<void> => ipcRenderer.invoke('jobs:resume', id),
  remove: (id: string, deleteFile: boolean): Promise<void> => ipcRenderer.invoke('jobs:remove', id, deleteFile),
  openFile: (id: string): Promise<void> => ipcRenderer.invoke('jobs:openFile', id),
  openFolder: (id: string): Promise<void> => ipcRenderer.invoke('jobs:openFolder', id),
  onUpdate: (cb: (job: Job) => void): (() => void) => subscribe('jobs:update', cb),
  onRemoved: (cb: (id: string) => void): (() => void) => subscribe('jobs:removed', cb)
}

export type IdmApi = typeof idm

contextBridge.exposeInMainWorld('idm', idm)
