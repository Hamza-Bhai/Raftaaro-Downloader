import { contextBridge } from 'electron'

/** The typed bridge the renderer uses to talk to the main process. Filled in by later tasks. */
const idm = {}

export type IdmApi = typeof idm

contextBridge.exposeInMainWorld('idm', idm)
