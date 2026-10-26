# IDM-Downloader — Design

Date: 2026-10-26
Status: Draft, awaiting user approval

## 1. Intent / why

The user wants a free download manager of their own, similar to IDM (Internet Download Manager).
Problems with the tools they use today:

1. Most good ones are **paid**.
2. Free ones give **low-quality video**.
3. Some give **audio only**, with no video.

Success means: free, the user's own software, YouTube (and other sites) at whatever quality they pick up to the best available (including 4K), and video **always with sound**.

It is for the user's own use for now. Distributing or selling it may be decided later, so the code should not make that hard. (No action needed now.)

## 2. Goals

- **Fast general downloads (IDM-style):** split a file into several parts and download them in parallel via HTTP `Range` requests, then join them. Pause / resume, including after the app restarts.
- **Video download from YouTube, Facebook, Instagram, TikTok, X/Twitter and the other sites `yt-dlp` supports.**
  - Pick **Video** or **Audio only**.
  - Pick quality (360p … 4K / best available). **"Best" is pre-selected.**
  - Video files always have audio: best video + best audio are downloaded separately and merged with FFmpeg.
  - Audio only: MP3 (and M4A).
- **Playlists and channels:** given a playlist or channel link, show the list of videos with checkboxes; selected ones are added to the queue.
- **Two ways to start a download:**
  1. Paste a link in the app. When the app gains focus and the clipboard holds a link, offer to download it.
  2. **Chrome extension:** a "Download" button on YouTube video pages (and a right-click "Download with IDM-Downloader" on any link). Clicking sends the link to the desktop app, which opens the quality window.
- **Login-only videos (Instagram, some Facebook):** a setting "Use my Chrome login", off by default. When on, `yt-dlp` reads cookies from the local Chrome profile. Nothing leaves the user's computer.
- Progress, speed and time remaining shown for every download.

## 3. Non-goals (for version 1)

- No reverse engineering or copying of IDM. Everything is written from scratch using public techniques ("clean room").
- No mac/Linux builds (Windows only for now; Electron keeps the door open).
- No accounts, cloud sync or payments.
- No torrent support.
- No scheduler or speed limiter in v1 (possible later versions).

## 4. Anti-goals (would count as a failure even if it "works")

- A YouTube download at 1080p+ that comes out **without sound**, or silently falls back to a low quality without telling the user.
- "Audio only" result when the user asked for video.
- Losing a partly downloaded file on pause, crash or restart.
- An app that is confusing — the main flow must be: paste link → (quality window) → Download.

## 5. Decisions made by the user

| Topic | Decision |
|---|---|
| Platform / tech | **Electron** (desktop app, Windows) |
| YouTube download | **Required** feature |
| Sites | **All**: YouTube, Facebook, Instagram, TikTok, etc. + normal files |
| Start a download | **Both**: paste link in app **and** Chrome extension button |
| Playlists / channels | **Yes** |
| Main screen look | **Mockup B — "Modern dark"**: left sidebar menu, link box at top, each download a card with thumbnail + progress bar |
| Quality window | **Mockup B — "Saaf aur chhota"**: two dropdowns (Video/Audio, Quality), "Best" pre-selected, estimated size, save folder, Download button |
| Use | Personal for now; sharing/selling maybe later |

### Main screen (mockup B)

- Left sidebar: **Downloads** (all / active), **Videos**, **Audio**, **Done**, **Settings**.
- Top: link input ("Link paste karein…") + blue **Download** button.
- List of cards. Each card: thumbnail (for video) or file icon, title, quality / size, progress bar, `%`, speed, time left, and buttons: pause/resume, open file, open folder, remove.
- Dark theme.

### Quality window (mockup B)

- Thumbnail, title, duration, channel name.
- Dropdown 1 "Qisam": 🎬 Video / 🎵 Audio.
- Dropdown 2 "Quality": ⭐ Best (shows the actual best, e.g. "Best (4K)"), then every available height (2160p, 1440p, 1080p, 720p, 480p, 360p) — or for audio: MP3, M4A.
- "Andazan size" (estimated size).
- Save folder with a change button.
- **Download** button.
- For a normal file link (not a video site), skip the dropdowns: show file name, size, folder, Download.

## 6. Builder's calls (my defaults — user can override)

These were not discussed with the user; they are my choices:

- **App name:** "IDM-Downloader" (window title / installer). Easy to rename later.
- **Language:** TypeScript for main and renderer; plain HTML/CSS for the UI (no heavy framework) unless the builder finds React clearly simpler.
- **Video engine:** bundle **`yt-dlp.exe`** and **`ffmpeg.exe`** with the app (in a `bin/` folder). Add a "Update yt-dlp" button in Settings, because YouTube changes often and old `yt-dlp` versions break.
- **Parallel parts per file:** 8 by default (setting 1–16). If the server does not support `Range`, fall back to a single connection.
- **Max downloads at the same time:** 3 (setting).
- **Default folders:** `Downloads\IDM-Downloader\Videos`, `\Audio`, `\Files`.
- **Clipboard watch:** only when the app window gets focus (not a constant background watcher), to avoid being annoying.
- **App ↔ Chrome extension link:** the app runs a small HTTP server on `127.0.0.1` only (fixed port, e.g. 47821) with a random token stored at install; the extension sends the URL there. Browser downloads are **not** hijacked automatically in v1 — only on button / right-click.
- **Storage:** download list and settings saved as JSON (or SQLite) in the app's user-data folder, so downloads survive a restart.
- **Packaging:** `electron-builder` NSIS installer for Windows. Chrome extension loaded as "unpacked" for personal use (no Web Store publishing in v1).
- **Close button** minimises to the system tray while downloads are running.

## 7. Suggested build order

1. App shell (mockup B) + normal file download with multi-part, pause/resume, progress.
2. yt-dlp + FFmpeg: single video, quality window, video+audio merge, MP3.
3. Playlists / channels.
4. Clipboard detection + Settings page (folders, parts, Chrome login cookies, update yt-dlp).
5. Chrome extension (YouTube button + right-click menu) talking to the app.
6. Installer.

Each step ends with something the user can run and try.

## 8. Notes / risks

- **YouTube terms:** YouTube's Terms of Service limit downloading. The user accepts this for personal use; worth keeping in mind if the app is later shared or sold.
- **Sites change:** YouTube/Instagram change often; keeping `yt-dlp` updatable is the main defence.
- **Cookies:** reading Chrome cookies may fail while Chrome is open (locked DB) — show a clear message.
- Machine already has FFmpeg 8.1.2 via winget and Node 24.22.1; `yt-dlp` is not installed. The app should still ship its own copies so it does not depend on this machine.
