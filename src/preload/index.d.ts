import type { IdmApi } from './index'

declare global {
  interface Window {
    idm: IdmApi
  }
}
