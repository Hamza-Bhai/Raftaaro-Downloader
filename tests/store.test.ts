import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/main/store'
import type { Job } from '../src/shared/types'

const fresh = (): { dir: string; dl: string } => ({
  dir: mkdtempSync(join(tmpdir(), 'raftaaro-store-')),
  dl: mkdtempSync(join(tmpdir(), 'raftaaro-dl-'))
})

describe('Store', () => {
  it('provides defaults on a fresh dir', () => {
    const { dir, dl } = fresh()
    const s = new Store(dir, dl).getSettings()
    expect(s.partsPerFile).toBe(8)
    expect(s.maxConcurrent).toBe(3)
    expect(s.useChromeCookies).toBe(false)
    expect(s.apiToken).toMatch(/^[0-9a-f]{32}$/)
    expect(s.folders.videos).toBe(join(dl, 'Raftaaro', 'Videos'))
    expect(s.folders.audio).toBe(join(dl, 'Raftaaro', 'Audio'))
    expect(s.folders.files).toBe(join(dl, 'Raftaaro', 'Files'))
  })

  it('keeps the same token across instances', () => {
    const { dir, dl } = fresh()
    const t1 = new Store(dir, dl).getSettings().apiToken
    expect(new Store(dir, dl).getSettings().apiToken).toBe(t1)
  })

  it('saves partial settings', () => {
    const { dir, dl } = fresh()
    new Store(dir, dl).saveSettings({ partsPerFile: 4 })
    const s = new Store(dir, dl).getSettings()
    expect(s.partsPerFile).toBe(4)
    expect(s.maxConcurrent).toBe(3)
  })

  it('round-trips jobs', () => {
    const { dir, dl } = fresh()
    const job: Job = {
      id: 'j1',
      kind: 'file',
      url: 'https://x.com/a.zip',
      title: 'a.zip',
      savePath: 'C:\\a.zip',
      status: 'paused',
      totalBytes: 10,
      receivedBytes: 5,
      speedBps: 0,
      etaSec: null,
      createdAt: 1
    }
    new Store(dir, dl).saveJobs([job])
    expect(new Store(dir, dl).getJobs()).toEqual([job])
  })

  it('returns no jobs when jobs.json is corrupt', () => {
    const { dir, dl } = fresh()
    writeFileSync(join(dir, 'jobs.json'), '{')
    expect(new Store(dir, dl).getJobs()).toEqual([])
  })
})
