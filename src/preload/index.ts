import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  AddPlaylistInput,
  AddVideoInput,
  Job,
  MediaType,
  PlaylistInfo,
  QualityOption,
  Settings,
  VideoInfo
} from '../shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

/** The typed bridge the renderer uses to talk to the main process. */
const api = {
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
  addPlaylist: (p: AddPlaylistInput): Promise<Job[]> => ipcRenderer.invoke('video:addPlaylist', p),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (s: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:save', s),
  updateYtDlp: (): Promise<{ version: string } | { error: string }> => ipcRenderer.invoke('ytdlp:update'),
  readClipboardLink: (): Promise<string | null> => ipcRenderer.invoke('clipboard:link'),
  onUpdate: (cb: (job: Job) => void): (() => void) => subscribe('jobs:update', cb),
  onRemoved: (cb: (id: string) => void): (() => void) => subscribe('jobs:removed', cb),
  onIncomingLink: (cb: (url: string) => void): (() => void) => subscribe('link:incoming', cb)
}

export type RaftaaroApi = typeof api

contextBridge.exposeInMainWorld('raftaaro', api)
