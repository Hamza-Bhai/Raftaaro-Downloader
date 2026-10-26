import { app } from 'electron'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

export type BinName = 'yt-dlp' | 'ffmpeg' | 'ffprobe'

/** Folder holding the bundled executables (resources/bin in dev, <resources>/bin when packaged). */
export function binDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'bin') : join(app.getAppPath(), 'resources', 'bin')
}

export function binPath(name: BinName): string {
  return join(binDir(), `${name}.exe`)
}

/** Self-update the bundled yt-dlp and return its version afterwards. */
export async function updateYtDlp(): Promise<string> {
  const exe = binPath('yt-dlp')
  await run(exe, ['-U'], { windowsHide: true, timeout: 120000 })
  const { stdout } = await run(exe, ['--version'], { windowsHide: true })
  return stdout.trim()
}
