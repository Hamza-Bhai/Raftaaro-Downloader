import type { RaftaaroApi } from './index'

declare global {
  interface Window {
    raftaaro: RaftaaroApi
  }
}
