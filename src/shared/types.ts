export type JobKind = 'file' | 'video'
export type JobStatus =
  | 'queued'
  | 'probing'
  | 'downloading'
  | 'merging'
  | 'paused'
  | 'done'
  | 'error'
export type MediaType = 'video' | 'audio'
export type AudioFormat = 'mp3' | 'm4a'

export interface VideoChoice {
  media: MediaType
  height: number | 'best'
  audioFormat?: AudioFormat
}

export interface Job {
  id: string
  kind: JobKind
  url: string
  title: string
  thumbnail?: string
  /** Final absolute file path, or the target folder for a video until yt-dlp reports the name. */
  savePath: string
  status: JobStatus
  totalBytes: number | null
  receivedBytes: number
  speedBps: number
  etaSec: number | null
  error?: string
  choice?: VideoChoice
  createdAt: number
}

export interface Settings {
  folders: { videos: string; audio: string; files: string }
  partsPerFile: number
  maxConcurrent: number
  useChromeCookies: boolean
  apiToken: string
}

export interface QualityOption {
  value: number | 'best'
  label: string
  estBytes: number | null
  audioFormat?: AudioFormat
}

export interface YtFormat {
  format_id: string
  ext: string
  height: number | null
  vcodec: string
  acodec: string
  filesize: number | null
  filesize_approx: number | null
  tbr: number | null
}

export interface VideoInfo {
  kind: 'video'
  url: string
  title: string
  durationSec: number | null
  uploader: string | null
  thumbnail: string | null
  formats: YtFormat[]
}

export interface PlaylistInfo {
  kind: 'playlist'
  url: string
  title: string
  entries: { url: string; title: string; durationSec: number | null }[]
}
