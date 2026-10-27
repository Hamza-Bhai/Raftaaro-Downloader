import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { readdirSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import type { Job, JobStatus } from '../shared/types'
import type { Store } from './store'
import { isYouTubeUrl } from '../shared/links'
import { RATE_LIMIT_MESSAGE } from './video/ytdlp'

/**
 * One running download. Events: `progress({received,total,speedBps})`, `path(finalPath)`,
 * `part(filePath)`, `status('merging')`, `done(finalPath)`, `error(Error)`.
 */
export interface Runner extends EventEmitter {
  start(): Promise<void>
  pause(): void
}

export type NewJob = Pick<Job, 'kind' | 'url' | 'title' | 'savePath' | 'totalBytes'> &
  Partial<Pick<Job, 'thumbnail' | 'choice'>>

const ACTIVE: JobStatus[] = ['probing', 'downloading', 'merging']
const PERSIST_MS = 2000
const MAX_YOUTUBE = 1
const RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000
const MAX_AUTO_RETRIES = 2

export class DownloadQueue extends EventEmitter {
  private jobs: Job[]
  private runners = new Map<string, Runner>()
  private lastPersist = 0
  private halted = false
  private wakeTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly store: Store,
    private readonly makeRunner: (job: Job) => Runner
  ) {
    super()
    this.jobs = store
      .getJobs()
      .map((j) => (ACTIVE.includes(j.status) ? { ...j, status: 'paused' as const, speedBps: 0, etaSec: null } : j))
    this.persist()
    this.pump()
  }

  list(): Job[] {
    return this.jobs.map((j) => ({ ...j }))
  }

  add(input: NewJob): Job {
    const job: Job = {
      ...input,
      id: randomUUID(),
      status: 'queued',
      receivedBytes: 0,
      speedBps: 0,
      etaSec: null,
      createdAt: Date.now()
    }
    this.jobs.push(job)
    this.changed(job)
    this.pump()
    return { ...job }
  }

  pause(id: string): void {
    const job = this.find(id)
    if (!job || job.status === 'done') return
    this.runners.get(id)?.pause()
    this.runners.delete(id)
    this.set(job, { status: 'paused', speedBps: 0, etaSec: null })
    this.pump()
  }

  resume(id: string): void {
    const job = this.find(id)
    if (!job || (job.status !== 'paused' && job.status !== 'error')) return
    this.set(job, { status: 'queued', error: undefined, attempts: undefined, retryAt: undefined })
    this.pump()
  }

  /** Drops the job at once; resolves when its files are deleted (as far as possible). */
  async remove(id: string, deleteFile: boolean): Promise<void> {
    const job = this.find(id)
    if (!job) return
    this.runners.get(id)?.pause()
    this.runners.delete(id)
    this.jobs = this.jobs.filter((j) => j !== job)
    this.persist()
    this.emit('removed', id)
    this.pump()
    if (!deleteFile) return
    const files = (job.partFiles ?? []).flatMap(partFileLeftovers)
    if (isFile(job.savePath)) files.push(job.savePath)
    await Promise.all([removeWhenFree(`${job.savePath}.rpart`, true), ...files.map((f) => removeWhenFree(f, false))])
  }

  /** Number of jobs currently running. */
  activeCount(): number {
    return this.runners.size
  }

  /** Pause every running job and start nothing new; used when the app quits. */
  pauseAll(): void {
    this.halted = true
    for (const id of [...this.runners.keys()]) this.pause(id)
  }

  /**
   * Start queued jobs, oldest first, up to the configured limit. YouTube gets extra care so the
   * user's network is not flagged: one YouTube download at a time, none during a cooldown.
   */
  private pump(): void {
    if (this.halted) return
    const max = this.store.getSettings().maxConcurrent
    const now = Date.now()
    const coolingUntil = Math.max(0, ...this.jobs.map((j) => (j.status === 'queued' && j.retryAt) || 0))
    let youtubeRunning = this.jobs.filter((j) => this.runners.has(j.id) && isYouTubeUrl(j.url)).length
    for (const job of this.jobs) {
      if (this.runners.size >= max) break
      if (job.status !== 'queued') continue
      if (isYouTubeUrl(job.url)) {
        if (youtubeRunning >= MAX_YOUTUBE || coolingUntil > now) continue
        youtubeRunning++
      }
      this.run(job)
    }
    this.scheduleWake(coolingUntil > now ? coolingUntil - now : null)
  }

  /** Run pump again when a cooldown ends. */
  private scheduleWake(ms: number | null): void {
    if (this.wakeTimer) clearTimeout(this.wakeTimer)
    this.wakeTimer = ms === null ? null : setTimeout(() => this.pump(), ms + 100)
  }

  private run(job: Job): void {
    const runner = this.makeRunner({ ...job })
    this.runners.set(job.id, runner)
    this.set(job, { status: 'downloading' })
    const live = (): boolean => this.runners.get(job.id) === runner
    runner.on('path', (p: string) => {
      if (!live()) return
      this.set(job, job.kind === 'file' ? { savePath: p, title: basename(p) } : { savePath: p })
    })
    runner.on('part', (p: string) => {
      if (!live() || job.partFiles?.includes(p)) return
      this.set(job, { partFiles: [...(job.partFiles ?? []), p] })
    })
    runner.on('status', (s: JobStatus) => live() && this.set(job, { status: s }))
    runner.on('progress', (p: { received: number; total: number | null; speedBps: number }) => {
      if (!live()) return
      const eta = p.total && p.speedBps > 0 ? Math.round((p.total - p.received) / p.speedBps) : null
      Object.assign(job, { receivedBytes: p.received, totalBytes: p.total, speedBps: p.speedBps, etaSec: eta })
      this.emit('update', { ...job })
      if (Date.now() - this.lastPersist > PERSIST_MS) this.persist()
    })
    runner.on('done', (finalPath: string) => {
      if (!live()) return
      this.runners.delete(job.id)
      this.set(job, {
        status: 'done',
        error: undefined,
        retryAt: undefined,
        partFiles: undefined,
        savePath: finalPath,
        speedBps: 0,
        etaSec: null,
        receivedBytes: job.totalBytes ?? job.receivedBytes
      })
      this.pump()
    })
    runner.on('error', (e: Error) => {
      if (!live()) return
      this.runners.delete(job.id)
      const attempts = (job.attempts ?? 0) + 1
      if (e.message === RATE_LIMIT_MESSAGE && attempts <= MAX_AUTO_RETRIES) {
        // back off instead of hammering YouTube; pump() starts it again after the cooldown
        this.set(job, {
          status: 'queued',
          error: e.message,
          attempts,
          retryAt: Date.now() + RATE_LIMIT_COOLDOWN_MS,
          speedBps: 0,
          etaSec: null
        })
      } else {
        this.set(job, { status: 'error', error: e.message, speedBps: 0, etaSec: null })
      }
      this.pump()
    })
    runner.start().catch((e: unknown) => runner.emit('error', e instanceof Error ? e : new Error(String(e))))
  }

  private find(id: string): Job | undefined {
    return this.jobs.find((j) => j.id === id)
  }

  private set(job: Job, patch: Partial<Job>): void {
    Object.assign(job, patch)
    this.changed(job)
  }

  private changed(job: Job): void {
    this.persist()
    this.emit('update', { ...job })
  }

  private persist(): void {
    this.lastPersist = Date.now()
    this.store.saveJobs(this.jobs)
  }
}

/** A file yt-dlp was writing plus its .part/.ytdl/fragment/merge leftovers. */
function partFileLeftovers(file: string): string[] {
  const ext = extname(file)
  const temp = `${file.slice(0, file.length - ext.length)}.temp${ext}`
  const frag = `${basename(file)}.part-Frag`
  let frags: string[] = []
  try {
    frags = readdirSync(dirname(file))
      .filter((name) => name.startsWith(frag))
      .map((name) => join(dirname(file), name))
  } catch {
    // the folder is gone already
  }
  return [file, `${file}.part`, `${file}.ytdl`, temp, ...frags]
}

/**
 * Delete a file or folder without blocking the app. A download that was just stopped can still
 * hold its file open for a moment (Windows then refuses with EPERM/EBUSY), so keep retrying;
 * a file that stays locked is left behind rather than failing the removal.
 */
async function removeWhenFree(path: string, recursive: boolean): Promise<void> {
  try {
    await rm(path, { recursive, force: true, maxRetries: 10, retryDelay: 200 })
  } catch (e) {
    console.error(`Could not delete ${path}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}
