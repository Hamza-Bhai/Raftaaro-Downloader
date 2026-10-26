# IDM-Downloader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A free Windows download manager (Electron) with IDM-style multi-part file downloads and full-quality video/audio downloads from YouTube and other sites, plus a Chrome extension that sends links to it.

**Architecture:** Electron main process owns all work: an HTTP multi-part engine for normal files, a `yt-dlp` + `ffmpeg` wrapper for video sites, a queue that runs both kinds of job, a JSON store, and a localhost-only HTTP API for the Chrome extension. The renderer is plain TypeScript + HTML/CSS (mockup B, dark) talking to main only through a typed preload bridge. Pure logic (ranges, format selection, progress parsing, link detection) lives in small modules with unit tests.

**Tech Stack:** Electron 45, electron-vite 6 (vanilla-ts), TypeScript, Vitest 5, electron-builder 26 (NSIS), bundled `yt-dlp.exe` + `ffmpeg.exe`, Chrome extension Manifest V3.

**Spec:** `docs/superpowers/specs/2026-10-26-idm-downloader-design.md`

## Global Constraints

- Windows only; Node 24.22.1 on the dev machine.
- App name / window title / installer name: `IDM-Downloader`.
- No code, assets or design copied from IDM (clean-room).
- Default parts per file: `8` (setting range `1`–`16`); fall back to `1` when the server lacks `Range` support.
- Max simultaneous downloads: `3` (setting).
- Default folders: `<Downloads>\IDM-Downloader\Videos`, `\Audio`, `\Files`.
- Video quality default: **Best**. Video output always contains audio (best video + best audio merged by ffmpeg, `--merge-output-format mp4`).
- Audio-only formats: `mp3`, `m4a`.
- Local API: bind `127.0.0.1` only, port `47821`, every request must carry header `X-IDM-Token: <token>`.
- Clipboard check only on window `focus`, never a background poll.
- "Use my Chrome login" (cookies) setting: default **off**.
- Browser downloads are never intercepted automatically; only via extension button / context menu.
- UI copy is Roman Urdu/English mix as in the mockups (e.g. "Link paste karein…", "Qisam", "Andazan size").

## Review Focus

1. **Server without `Range` / without `Content-Length`** → download still completes with 1 connection; progress shows bytes without `%`. (Task 2 test `falls back to single connection when ranges unsupported`.)
2. **Resume after app restart** → parts already on disk are not re-downloaded; if the remote size changed, restart from zero instead of producing a corrupt file. (Task 2 tests `resumes from existing part files`, `restarts when remote size changed`.)
3. **Titles/filenames with Windows-illegal characters** (`<>:"/\|?*`, trailing dots, `CON`) → saved with a safe name, no crash. (Task 1 test `sanitizeFileName`.)
4. **Chosen quality not available / only video-only streams at that height** → still produces a file with audio, never silent; the dialog never offers a height that does not exist. (Task 4 tests on `buildFormatSelector` and `buildQualityOptions`.)
5. **yt-dlp failure (outdated, private video, needs login)** → the card shows a readable error ("Login chahiye — Settings mein 'Chrome login' on karein" / "yt-dlp update karein") instead of hanging. (Task 5 test `classifyYtDlpError`.)

---

## File Structure

```
package.json, electron.vite.config.ts, tsconfig*.json, vitest.config.ts, electron-builder.yml
resources/bin/yt-dlp.exe, resources/bin/ffmpeg.exe      (downloaded by scripts/fetch-bins.mjs, git-ignored)
scripts/fetch-bins.mjs                                  fetch + checksum-verify the two binaries
src/shared/types.ts                                     all cross-process types
src/main/index.ts                                       app bootstrap, window, tray, wiring
src/main/ipc.ts                                         ipcMain handlers (thin; delegates)
src/main/util/filename.ts                               sanitizeFileName, uniquePath
src/main/util/links.ts                                  isDownloadableUrl, isVideoSiteUrl
src/main/store.ts                                       JSON settings + job list persistence
src/main/http/ranges.ts                                 splitRanges
src/main/http/http-download.ts                          HttpDownload (multi-part engine)
src/main/video/formats.ts                               buildQualityOptions, buildFormatSelector
src/main/video/ytdlp.ts                                 probe(), YtDlpDownload, parseProgress, classifyYtDlpError
src/main/video/bins.ts                                  binPath(), updateYtDlp()
src/main/queue.ts                                       DownloadQueue
src/main/local-api.ts                                   startLocalApi
src/preload/index.ts                                    contextBridge `window.idm`
src/renderer/index.html, styles.css, main.ts            shell (sidebar, link box, list)
src/renderer/card.ts                                    renderCard / updateCard
src/renderer/quality-dialog.ts                          quality window (mockup B)
src/renderer/playlist-dialog.ts                         playlist checkbox list
src/renderer/settings.ts                                settings page
extension/manifest.json, background.js, youtube.js, popup.html, popup.js
tests/**                                                Vitest unit tests (main-process modules only)
```

## Shared types (`src/shared/types.ts`, created in Task 1, extended later)

```ts
export type JobKind = 'file' | 'video';
export type JobStatus = 'queued' | 'probing' | 'downloading' | 'merging' | 'paused' | 'done' | 'error';
export type MediaType = 'video' | 'audio';
export type AudioFormat = 'mp3' | 'm4a';

export interface VideoChoice { media: MediaType; height: number | 'best'; audioFormat?: AudioFormat }

export interface Job {
  id: string; kind: JobKind; url: string; title: string; thumbnail?: string;
  savePath: string;            // final absolute file path (or folder for video until known)
  status: JobStatus; totalBytes: number | null; receivedBytes: number;
  speedBps: number; etaSec: number | null; error?: string;
  choice?: VideoChoice; createdAt: number;
}

export interface Settings {
  folders: { videos: string; audio: string; files: string };
  partsPerFile: number; maxConcurrent: number; useChromeCookies: boolean; apiToken: string;
}

export interface QualityOption { value: number | 'best'; label: string; estBytes: number | null; audioFormat?: AudioFormat }

export interface VideoInfo {
  kind: 'video'; url: string; title: string; durationSec: number | null; uploader: string | null;
  thumbnail: string | null; formats: YtFormat[];
}
export interface PlaylistInfo { kind: 'playlist'; url: string; title: string; entries: { url: string; title: string; durationSec: number | null }[] }
export interface YtFormat { format_id: string; ext: string; height: number | null; vcodec: string; acodec: string; filesize: number | null; filesize_approx: number | null; tbr: number | null }
```

---

### Task 1: Project scaffold, utilities, store

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `vitest.config.ts`, `.gitignore`, `src/shared/types.ts`, `src/main/util/filename.ts`, `src/main/util/links.ts`, `src/main/store.ts`, minimal `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.ts`
- Test: `tests/filename.test.ts`, `tests/links.test.ts`, `tests/store.test.ts`

**Interfaces:**
- Produces:
  - `sanitizeFileName(name: string): string`
  - `uniquePath(dir: string, fileName: string): string` — appends ` (1)`, ` (2)`… if exists
  - `isDownloadableUrl(text: string): boolean` — `http(s)://` only, trimmed, single token
  - `isVideoSiteUrl(url: string): boolean` — host matches youtube.com, youtu.be, facebook.com, fb.watch, instagram.com, tiktok.com, x.com, twitter.com, vimeo.com, dailymotion.com
  - `class Store { constructor(dir: string, downloadsRoot: string); getSettings(): Settings; saveSettings(s: Partial<Settings>): Settings; getJobs(): Job[]; saveJobs(jobs: Job[]): void }` — files `settings.json`, `jobs.json`; atomic write (write `.tmp` then rename); defaults per Global Constraints; `apiToken` = 32 random hex chars generated once.

- [ ] **Step 1:** `git init`, scaffold with `npm create @quick-start/electron@latest . -- --template vanilla-ts`, add `vitest`, set `"test": "vitest run"`. `.gitignore`: `node_modules`, `out`, `dist`, `resources/bin/*.exe`, `.superpowers/`.
- [ ] **Step 2: Write failing tests**

```ts
// filename.test.ts
expect(sanitizeFileName('a<b>:c"d/e\\f|g?h*i')).toBe('a_b__c_d_e_f_g_h_i');
expect(sanitizeFileName('song. ')).toBe('song');
expect(sanitizeFileName('CON')).toBe('_CON');
expect(sanitizeFileName('')).toBe('download');
expect(sanitizeFileName('x'.repeat(300)).length).toBeLessThanOrEqual(200);
// uniquePath with a tmp dir containing 'a.mp4' -> '<dir>\\a (1).mp4'
// links.test.ts
expect(isDownloadableUrl(' https://x.com/a.zip ')).toBe(true);
expect(isDownloadableUrl('hello https://x.com')).toBe(false);
expect(isDownloadableUrl('ftp://x')).toBe(false);
expect(isVideoSiteUrl('https://youtu.be/abc')).toBe(true);
expect(isVideoSiteUrl('https://m.youtube.com/watch?v=1')).toBe(true);
expect(isVideoSiteUrl('https://example.com/a.mp4')).toBe(false);
// store.test.ts
// fresh dir -> getSettings().partsPerFile===8, maxConcurrent===3, useChromeCookies===false, apiToken matches /^[0-9a-f]{32}$/
// token is identical on a second Store over the same dir
// saveJobs([job]) then new Store(dir).getJobs() deep-equals [job]
// corrupt jobs.json ('{') -> getJobs() returns [] (no throw)
```

- [ ] **Step 3:** Run `npm test` → FAIL (modules missing).
- [ ] **Step 4:** Implement the three modules. Tests pass a tmp `downloadsRoot` so they never touch the real Downloads folder; `index.ts` passes `app.getPath('userData')`, `app.getPath('downloads')`.
- [ ] **Step 5:** `npm test` → PASS; `npm run dev` opens an empty window titled `IDM-Downloader`.
- [ ] **Step 6:** Commit `chore: scaffold electron app with utils and store`.

### Task 2: Multi-part HTTP engine

**Files:**
- Create: `src/main/http/ranges.ts`, `src/main/http/http-download.ts`
- Test: `tests/ranges.test.ts`, `tests/http-download.test.ts` (spins up a local `node:http` server serving a 5 MB random buffer, with a flag to disable `Accept-Ranges` / `Content-Length`)

**Interfaces:**
- Consumes: `sanitizeFileName`, `uniquePath`
- Produces:
  - `splitRanges(size: number, parts: number): { start: number; end: number }[]` — inclusive ends, contiguous, last part takes remainder, never more parts than bytes; `parts` clamped to 1–16.
  - `class HttpDownload extends EventEmitter` — `constructor(opts: { url: string; dir: string; fileName?: string; parts: number; stateFile?: string })`; `start(): Promise<void>`; `pause(): void`; `on('progress', (p: { received: number; total: number | null; speedBps: number }) => void)`; `on('done', (finalPath: string) => void)`; `on('error', (e: Error) => void)`; readonly `finalPath`.
  - On-disk state: `<final>.idmpart/` folder containing `meta.json` `{ url, total, etag, lastModified, ranges, done: number[] }` and `part-<i>` files. Joined into final file then folder removed.
- Behaviour: probe with `HEAD` (fallback `GET` with `Range: bytes=0-0`); file name from `Content-Disposition`, else URL path, else `download`; follow redirects (max 10); progress events throttled to every 250 ms; speed = moving average over last 3 s.

- [ ] **Step 1: Write failing tests**

```ts
expect(splitRanges(10, 3)).toEqual([{start:0,end:2},{start:3,end:5},{start:6,end:9}]);
expect(splitRanges(2, 8)).toHaveLength(2);
expect(splitRanges(100, 0)).toEqual([{start:0,end:99}]);
it('downloads with 8 parts and output equals source bytes')        // sha256 match, server saw 8 Range requests
it('falls back to single connection when ranges unsupported')     // server without Accept-Ranges/Content-Length; total null; file matches
it('resumes from existing part files')                            // pause at ~50%, new HttpDownload same stateFile; server receives no request for completed ranges; file matches
it('restarts when remote size changed')                           // meta total differs from new HEAD -> parts deleted, fresh download, file matches
it('emits error on 404 without creating the final file')
```

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement using `node:https`/`node:http` streams (no extra deps). Each part appends to its file and resumes at `start + existingPartSize`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: multi-part http download engine with resume`.

### Task 3: Queue, IPC, main screen (mockup B), file downloads end-to-end

**Files:**
- Create: `src/main/queue.ts`, `src/main/ipc.ts`, `src/renderer/styles.css`, `src/renderer/card.ts`; modify `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.ts`
- Test: `tests/queue.test.ts` (fake runner)

**Interfaces:**
- Consumes: `Store`, `HttpDownload`
- Produces:
  - `interface Runner extends EventEmitter { start(): Promise<void>; pause(): void }` (both `HttpDownload` and later `YtDlpDownload` satisfy it, same `progress/done/error` events; `YtDlpDownload` also emits `status` with `'merging'`).
  - `class DownloadQueue extends EventEmitter { constructor(store: Store, makeRunner: (job: Job) => Runner); add(job: Omit<Job,'id'|'status'|'receivedBytes'|'speedBps'|'etaSec'|'createdAt'>): Job; pause(id: string): void; resume(id: string): void; remove(id: string, deleteFile: boolean): void; list(): Job[]; on('update', (job: Job) => void) }` — respects `settings.maxConcurrent`; persists on every status change (and progress at most every 2 s); on construction, jobs left `downloading` become `paused`.
  - Preload `window.idm`: `addFile(url: string): Promise<Job>`, `pause(id)`, `resume(id)`, `remove(id, deleteFile)`, `openFile(id)`, `openFolder(id)`, `list(): Promise<Job[]>`, `onUpdate(cb: (job: Job) => void): () => void`, `readClipboardLink(): Promise<string | null>` (Task 6), plus video/settings calls added in later tasks.
- UI (mockup B): left sidebar `⬇ Downloads`, `🎬 Videos`, `🎵 Audio`, `✅ Done`, `⚙ Settings` (filters list by kind/status); top bar input placeholder `Link paste karein…` + blue `Download` button; cards with thumbnail/file icon, title, size, progress bar, `%`, speed, `N min baqi`, buttons ⏸/▶, 📂, 🗑. Dark palette: bg `#1e1f26`, sidebar `#16171c`, card `#2b2d36`, accent `#3b82f6`, done `#22c55e`.

- [ ] **Step 1: Failing tests:** `it('runs at most maxConcurrent jobs')` (4 jobs, max 3 → 3 running, 4th starts after one emits done); `it('marks interrupted downloads paused on startup')`; `it('pause then resume restarts runner')`; `it('remove with deleteFile deletes savePath')`.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implement. **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Manual check:** `npm run dev`, paste `https://speed.hetzner.de/100MB.bin` (or any large file), see card progress, pause/resume, file appears in `Downloads\IDM-Downloader\Files`. Restart app mid-download → card is paused, resume continues.
- [ ] **Step 6:** Commit `feat: download queue and main screen`.

### Task 4: Binaries + video format logic

**Files:**
- Create: `scripts/fetch-bins.mjs`, `src/main/video/bins.ts`, `src/main/video/formats.ts`
- Test: `tests/formats.test.ts` with fixtures `tests/fixtures/yt-4k.json` (formats incl. 2160p vp9 video-only, 1080p avc1 video-only, 360p muxed, m4a + opus audio), `tests/fixtures/muxed-only.json` (e.g. a Facebook-style list with only muxed formats)

**Interfaces:**
- Produces:
  - `scripts/fetch-bins.mjs` — downloads latest `yt-dlp.exe` from `https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe` verifying against that release's `SHA2-256SUMS`, and `ffmpeg.exe` from the gyan.dev release essentials zip verified against its `.sha256`; writes to `resources/bin/`. npm script `"fetch-bins"`, also run in `postinstall`.
  - `binPath(name: 'yt-dlp' | 'ffmpeg'): string` — dev: `resources/bin/<name>.exe`; packaged: `process.resourcesPath/bin/<name>.exe`.
  - `updateYtDlp(): Promise<string>` — runs `yt-dlp -U`, resolves with new version string.
  - `buildQualityOptions(info: VideoInfo, media: MediaType): QualityOption[]` — video: first `{value:'best', label:'⭐ Best (<label of top>)'}` then each distinct height present (desc) labelled `2160p (4K)`, `1440p (2K)`, `1080p`, `720p`, `480p`, `360p`, … with `estBytes` = chosen video size + best audio size (null if unknown). audio: `[{value:'best',label:'MP3',audioFormat:'mp3',estBytes}, {value:'best',label:'M4A',audioFormat:'m4a',estBytes}]` (`estBytes` = best audio size).
  - `buildFormatSelector(choice: VideoChoice): string[]` — yt-dlp args:
    - video best: `['-f','bv*+ba/b','--merge-output-format','mp4']`
    - video height h: `['-f',`bv*[height<=${h}]+ba/b[height<=${h}]/bv*+ba/b`,'--merge-output-format','mp4']`
    - audio mp3: `['-f','ba/b','-x','--audio-format','mp3','--audio-quality','0']`
    - audio m4a: `['-f','ba[ext=m4a]/ba/b','-x','--audio-format','m4a']`

- [ ] **Step 1: Failing tests:** options for `yt-4k.json` video = `['⭐ Best (2160p (4K))','2160p (4K)','1080p','360p']` (labels) with no height absent from fixture; `estBytes` for 1080p = 1080p video size + largest audio size; `muxed-only.json` still yields its heights; every video selector string contains `+ba` (never video-only) and `--merge-output-format mp4`; mp3 args contain `-x` and `mp3`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5:** `npm run fetch-bins` → both exe present, `resources/bin/yt-dlp.exe --version` prints a version.
- [ ] **Step 6:** Commit `feat: bundled binaries and quality selection`.

### Task 5: yt-dlp wrapper, quality dialog, video downloads end-to-end

**Files:**
- Create: `src/main/video/ytdlp.ts`, `src/renderer/quality-dialog.ts`; modify `src/main/ipc.ts`, `src/main/index.ts` (runner factory), `src/preload/index.ts`, `src/renderer/main.ts`
- Test: `tests/ytdlp.test.ts`

**Interfaces:**
- Consumes: `binPath`, `buildFormatSelector`, `buildQualityOptions`, `Runner`, `Settings`
- Produces:
  - `probe(url: string, settings: Settings): Promise<VideoInfo | PlaylistInfo>` — `yt-dlp -J --flat-playlist --no-warnings [--cookies-from-browser chrome] <url>`; `_type==='playlist'` → `PlaylistInfo`.
  - `parseProgress(line: string): { percent: number; totalBytes: number | null; speedBps: number | null; etaSec: number | null } | null` — run yt-dlp with `--newline --progress-template "download:IDMP %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s %(progress.speed)s %(progress.eta)s"`; lines starting `IDMP` parsed, `NA` → null.
  - `classifyYtDlpError(stderr: string): string` — maps: `Sign in to confirm` / `login required` / `private` → `"Login chahiye — Settings mein 'Chrome login' on karein"`; `HTTP Error 403` / `Unable to extract` / `nsig` → `"yt-dlp purana ho gaya — Settings se update karein"`; `Video unavailable` → `"Video dastiyab nahi"`; else last `ERROR:` line.
  - `class YtDlpDownload extends EventEmitter implements Runner` — `constructor(job: Job, settings: Settings)`; args: selector + `--ffmpeg-location <ffmpeg dir>` + `-o <folder>\%(title).180B [%(id)s].%(ext)s` + `--print after_move:filepath` + `--no-mtime` + `--continue`; emits `status('merging')` on `[Merger]`/`[ExtractAudio]` lines; `done(finalPath)` from the printed filepath; `pause()` kills the process tree (`taskkill /pid <pid> /T /F`), `--continue` resumes.
  - Preload: `probe(url): Promise<VideoInfo | PlaylistInfo | {error: string}>`, `qualityOptions(info, media): Promise<QualityOption[]>`, `addVideo(url, title, thumbnail, choice: VideoChoice, folder?: string): Promise<Job>`.
- Quality dialog (mockup B): thumbnail, title, `mm:ss · uploader`; dropdown **Qisam** (`🎬 Video` / `🎵 Audio`); dropdown **Quality** (from `qualityOptions`, Best preselected); `Andazan size: …`; folder line `📁 <path>` with change button (Electron folder picker); blue `⬇ Download`. Shown when a pasted/received URL is a video site (`isVideoSiteUrl`) **or** `probe` succeeds; otherwise the plain file flow (Task 3) with name/size/folder.

- [ ] **Step 1: Failing tests:** `parseProgress('IDMP 1048576 4194304 NA 524288 6')` → `{percent:25,totalBytes:4194304,speedBps:524288,etaSec:6}`; uses estimate when total is `NA`; non-IDMP line → `null`; the three `classifyYtDlpError` mappings with real yt-dlp error strings; `probe` against a stub executable (`tests/fixtures/fake-ytdlp.cmd` that echoes a fixture JSON) returns `VideoInfo` / `PlaylistInfo` correctly.
- [ ] **Step 2:** FAIL. **Step 3:** implement (inject the binary path so tests use the stub). **Step 4:** PASS.
- [ ] **Step 5: Manual check:** a Creative Commons YouTube video → Best → resulting `.mp4` plays **with sound** at the top height (`ffprobe` shows one video + one audio stream); 720p choice → height 720; Audio → MP3 → `.mp3` in `Audio` folder; pause/resume mid-download works.
- [ ] **Step 6:** Commit `feat: video downloads via yt-dlp with quality dialog`.

### Task 6: Playlists, clipboard, settings page

**Files:**
- Create: `src/renderer/playlist-dialog.ts`, `src/renderer/settings.ts`; modify `ipc.ts`, `preload/index.ts`, `renderer/main.ts`
- Test: extend `tests/links.test.ts`

**Interfaces:**
- Consumes: `probe`, `PlaylistInfo`, `Store`, `updateYtDlp`, `isDownloadableUrl`
- Produces:
  - Playlist dialog: title, count, `Sab chunein` toggle, checkbox list (title + duration), one **Qisam** + **Quality** pair applied to all (quality list: Best, 2160p, 1440p, 1080p, 720p, 480p, 360p — selector falls back automatically per video), `⬇ Download (N)` → one `addVideo` per checked entry into folder `<Videos>\<playlist title>`.
  - Clipboard: on window `focus`, `readClipboardLink()` returns the clipboard text if `isDownloadableUrl` and not the last offered link; renderer shows a small banner `Link mila: <url> — Download?` with button. Same link never offered twice in a session.
  - Settings page: three folder pickers, `partsPerFile` (1–16), `maxConcurrent` (1–10), toggle `Chrome login use karein` (with one-line note that Chrome may need to be closed), `yt-dlp update karein` button showing resulting version, read-only API token with copy button (for the extension).
  - Preload: `getSettings()`, `saveSettings(partial)`, `pickFolder(): Promise<string | null>`, `updateYtDlp(): Promise<string>`.

- [ ] **Step 1: Failing test:** `extractFirstUrl('dekho https://youtu.be/x yeh')` → `'https://youtu.be/x'` (add to `links.ts`; clipboard uses it so a link with surrounding text is still caught).
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5: Manual check:** a small public playlist → list shows all entries, uncheck one, download → only checked ones queued, all in the playlist folder; copy a link, focus app → banner appears once; change parts to 4 → next file download uses 4 ranges; update button reports a version.
- [ ] **Step 6:** Commit `feat: playlists, clipboard detection and settings`.

### Task 7: Local API + Chrome extension

**Files:**
- Create: `src/main/local-api.ts`, `extension/manifest.json`, `extension/background.js`, `extension/youtube.js`, `extension/popup.html`, `extension/popup.js`, `extension/icon128.png`
- Test: `tests/local-api.test.ts`

**Interfaces:**
- Consumes: `Settings.apiToken`, a callback into main
- Produces:
  - `startLocalApi(opts: { port: number; token: string; onLink: (url: string, title?: string) => void }): Promise<{ close(): Promise<void> }>` — `127.0.0.1:47821`; `GET /ping` → `200 {"app":"IDM-Downloader"}` (token required); `POST /add` JSON `{url, title?}` → `202`; wrong/missing token → `401`; non-http(s) url → `400`; body > 16 KB → `413`. CORS: allow origin `chrome-extension://*` only. In main, `onLink` focuses the window and opens the quality dialog (video site) or file flow.
  - Extension (MV3): popup to paste/save the token (stored in `chrome.storage.local`) with a `Test connection` button (`/ping`); context menu `Download with IDM-Downloader` on links, video and the page; content script on `https://www.youtube.com/*` injecting a blue `⬇ Download` button next to the video's like/share bar (re-inject on YouTube SPA navigation `yt-navigate-finish`), sending the current watch URL; when the app is not running show a toast `IDM-Downloader app khulain`.

- [ ] **Step 1: Failing tests:** `/add` with correct token → 202 and `onLink` called with url; wrong token → 401 and not called; `javascript:alert(1)` url → 400; server address is `127.0.0.1` (check `server.address()`); oversized body → 413.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5: Manual check:** load `extension/` unpacked in Chrome, paste token, Test connection → OK; on a YouTube video the button appears and opens the app's quality dialog; right-click a `.zip` link → file download starts in the app.
- [ ] **Step 6:** Commit `feat: chrome extension and local api`.

### Task 8: Tray + installer

**Files:**
- Create: `electron-builder.yml`, `build/icon.ico`; modify `src/main/index.ts`
- Test: manual

**Interfaces:**
- Produces: closing the window while any job is `downloading`/`merging` hides to tray (tooltip `IDM-Downloader — N downloads chal rahe hain`; menu `Kholain` / `Band karein`); otherwise quits. Single-instance lock (second launch focuses the first). `electron-builder.yml`: appId `com.local.idmdownloader`, productName `IDM-Downloader`, NSIS (per-user, choose dir allowed), `extraResources: resources/bin -> bin`.

- [ ] **Step 1:** Implement tray + single instance.
- [ ] **Step 2:** `npm run build:win` → `dist\IDM-Downloader Setup <ver>.exe` created.
- [ ] **Step 3: Manual check:** install, run from Start menu, a YouTube Best download works (proves bundled `yt-dlp`/`ffmpeg` paths resolve in the packaged app), close during download → tray, reopen from tray.
- [ ] **Step 4:** `npm test` all PASS. Commit `feat: tray and windows installer`.
