import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/main/store'
import { DownloadQueue, type Runner } from '../src/main/queue'
import type { Job } from '../src/shared/types'

class FakeRunner extends EventEmitter implements Runner {
  started = 0
  paused = 0
  start(): Promise<void> {
    this.started++
    return Promise.resolve()
  }
  pause(): void {
    this.paused++
  }
}

function setup(jobs: Job[] = []): { store: Store; queue: DownloadQueue; runners: Map<string, FakeRunner> } {
  const store = new Store(mkdtempSync(join(tmpdir(), 'idm-q-')), mkdtempSync(join(tmpdir(), 'idm-dl-')))
  store.saveJobs(jobs)
  const runners = new Map<string, FakeRunner>()
  const queue = new DownloadQueue(store, (job) => {
    const r = new FakeRunner()
    runners.set(job.id, r)
    return r
  })
  return { store, queue, runners }
}

const input = (n: number): Parameters<DownloadQueue['add']>[0] => ({
  kind: 'file',
  url: `https://x.com/${n}.zip`,
  title: `${n}.zip`,
  savePath: 'C:\\dl',
  totalBytes: null
})

const running = (q: DownloadQueue): number => q.list().filter((j) => j.status === 'downloading').length

describe('DownloadQueue', () => {
  it('runs at most maxConcurrent jobs', () => {
    const { queue, runners } = setup()
    const jobs = [1, 2, 3, 4].map((n) => queue.add(input(n)))
    expect(running(queue)).toBe(3)
    expect(queue.list().find((j) => j.id === jobs[3].id)!.status).toBe('queued')
    runners.get(jobs[0].id)!.emit('done', 'C:\\dl\\1.zip')
    expect(queue.list().find((j) => j.id === jobs[0].id)!.status).toBe('done')
    expect(queue.list().find((j) => j.id === jobs[0].id)!.savePath).toBe('C:\\dl\\1.zip')
    expect(runners.get(jobs[3].id)!.started).toBe(1)
  })

  it('marks interrupted downloads paused on startup', () => {
    const stale: Job = {
      ...input(9),
      id: 'old',
      status: 'downloading',
      receivedBytes: 5,
      speedBps: 100,
      etaSec: 3,
      createdAt: 1
    } as Job
    const { queue, runners } = setup([stale])
    expect(queue.list()[0].status).toBe('paused')
    expect(runners.size).toBe(0)
  })

  it('pause then resume restarts runner', () => {
    const { queue, runners } = setup()
    const job = queue.add(input(1))
    queue.pause(job.id)
    expect(runners.get(job.id)!.paused).toBe(1)
    expect(queue.list()[0].status).toBe('paused')
    queue.resume(job.id)
    expect(queue.list()[0].status).toBe('downloading')
    expect(runners.get(job.id)!.started).toBe(1) // new runner instance started
  })

  it('records progress, path and errors from the runner', () => {
    const { queue, runners } = setup()
    const job = queue.add(input(1))
    const r = runners.get(job.id)!
    r.emit('path', 'C:\\dl\\1.zip')
    r.emit('progress', { received: 50, total: 100, speedBps: 10 })
    let j = queue.list()[0]
    expect(j.savePath).toBe('C:\\dl\\1.zip')
    expect(j.receivedBytes).toBe(50)
    expect(j.totalBytes).toBe(100)
    expect(j.etaSec).toBe(5)
    r.emit('error', new Error('HTTP 404'))
    j = queue.list()[0]
    expect(j.status).toBe('error')
    expect(j.error).toBe('HTTP 404')
  })

  it('remove with deleteFile deletes savePath and parts but never a folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'idm-rm-'))
    const file = join(dir, 'a.zip')
    writeFileSync(file, 'x')
    mkdirSync(`${file}.idmpart`)
    const { queue } = setup()
    const job = queue.add({ ...input(1), savePath: file })
    queue.remove(job.id, true)
    expect(existsSync(file)).toBe(false)
    expect(existsSync(`${file}.idmpart`)).toBe(false)
    expect(queue.list()).toEqual([])

    const job2 = queue.add({ ...input(2), savePath: dir })
    queue.remove(job2.id, true)
    expect(existsSync(dir)).toBe(true)
  })

  it('persists jobs to the store', () => {
    const { store, queue } = setup()
    queue.add(input(1))
    expect(store.getJobs()).toHaveLength(1)
  })
})
