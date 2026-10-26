import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AddVideoInput, Job, MediaType, PlaylistInfo, QualityOption, Settings, VideoInfo } from '../shared/types'

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
  probe: (url: string): Promise<VideoInfo | PlaylistInfo | { error: string }> => ipcRenderer.invoke('video:probe', url),
  qualityOptions: (info: VideoInfo, media: MediaType): Promise<QualityOption[]> =>
    ipcRenderer.invoke('video:qualityOptions', info, media),
  addVideo: (v: AddVideoInput): Promise<Job> => ipcRenderer.invoke('video:add', v),
  pickFolder: (current?: string): Promise<string | null> => ipcRenderer.invoke('dialog:pickFolder', current),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  onUpdate: (cb: (job: Job) => void): (() => void) => subscribe('jobs:update', cb),
  onRemoved: (cb: (id: string) => void): (() => void) => subscribe('jobs:removed', cb)
}

export type IdmApi = typeof idm

contextBridge.exposeInMainWorld('idm', idm)
