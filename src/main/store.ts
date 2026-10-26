import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Job, Settings } from '../shared/types'

/** Persists settings and the download list as JSON in the app's user-data folder. */
export class Store {
  private settings: Settings

  constructor(
    private readonly dir: string,
    downloadsRoot: string
  ) {
    mkdirSync(dir, { recursive: true })
    const root = join(downloadsRoot, 'Raftaaro')
    const defaults: Settings = {
      folders: {
        videos: join(root, 'Videos'),
        audio: join(root, 'Audio'),
        files: join(root, 'Files')
      },
      partsPerFile: 8,
      maxConcurrent: 3,
      useChromeCookies: false,
      apiToken: randomBytes(16).toString('hex')
    }
    const saved = this.read<Partial<Settings>>('settings.json') ?? {}
    this.settings = {
      ...defaults,
      ...saved,
      folders: { ...defaults.folders, ...saved.folders }
    }
    if (!saved.apiToken) this.write('settings.json', this.settings)
  }

  getSettings(): Settings {
    return structuredClone(this.settings)
  }

  saveSettings(partial: Partial<Settings>): Settings {
    this.settings = {
      ...this.settings,
      ...partial,
      folders: { ...this.settings.folders, ...partial.folders }
    }
    this.write('settings.json', this.settings)
    return this.getSettings()
  }

  getJobs(): Job[] {
    const jobs = this.read<Job[]>('jobs.json')
    return Array.isArray(jobs) ? jobs : []
  }

  saveJobs(jobs: Job[]): void {
    this.write('jobs.json', jobs)
  }

  private read<T>(name: string): T | null {
    try {
      return JSON.parse(readFileSync(join(this.dir, name), 'utf8')) as T
    } catch {
      return null
    }
  }

  private write(name: string, data: unknown): void {
    const file = join(this.dir, name)
    writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2))
    renameSync(`${file}.tmp`, file)
  }
}
