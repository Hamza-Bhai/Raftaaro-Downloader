# Raftaaro

[![CI](https://github.com/Hamza-Bhai/Raftaaro-Downloader/actions/workflows/ci.yml/badge.svg)](https://github.com/Hamza-Bhai/Raftaaro-Downloader/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/Hamza-Bhai/Raftaaro-Downloader)](https://github.com/Hamza-Bhai/Raftaaro-Downloader/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Hamza-Bhai/Raftaaro-Downloader/total)](https://github.com/Hamza-Bhai/Raftaaro-Downloader/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078D6)](#download-and-install-no-coding-needed)
[![License: MIT](https://img.shields.io/github/license/Hamza-Bhai/Raftaaro-Downloader)](LICENSE)

https://github.com/user-attachments/assets/c466fd08-4d80-41b3-9966-6441420455ae

A free, open-source download manager for Windows. It downloads ordinary files over several connections at once, and videos and audio from YouTube, Instagram, Facebook and other sites through [yt-dlp](https://github.com/yt-dlp/yt-dlp). A Chrome extension sends links to the app in one click.

Built with Electron and TypeScript.

## Features

**Videos and audio**

- Pick a quality from the ones the video really has (144p up to 4K/8K), with an estimated size for each
- Audio only, as MP3 or M4A
- Playlists and channels: choose which videos to get; they are saved in a folder named after the playlist
- YouTube, YouTube Shorts, Instagram, Facebook, TikTok, X/Twitter, Vimeo, Dailymotion

**Files**

- Multi-connection downloads (1–16 parts per file)
- Pause and resume, even after closing the app

**Chrome extension**

- A "⬇ Download" button on YouTube videos and Shorts, Instagram and Facebook videos
- Right-click any link → "Download with Raftaaro"
- Can pass your YouTube, Instagram and Facebook login to the app, so videos that need a login work and YouTube does not treat you as a bot

**Also**

- Offers to download a link you copy to the clipboard
- Queue with a limit on parallel downloads; YouTube downloads run one at a time with pauses, and back off automatically when YouTube asks
- Keeps running in the tray while downloads are active
- Updates yt-dlp by itself

## Download and install (no coding needed)

[**⬇ Download the latest version**](https://github.com/Hamza-Bhai/Raftaaro-Downloader/releases/latest)

Works on Windows 10 and 11 (64-bit).

1. Open the link above. Under **Assets**, click **`Raftaaro-Setup-x.y.z.exe`** to download it (about 220 MB, because the video tools are included).
2. Run the downloaded file.
3. Windows may show **"Windows protected your PC"**, because the app is new and not signed with a paid certificate. Click **More info**, then **Run anyway**.
4. Choose where to install, then finish. Raftaaro opens from the desktop shortcut or the Start menu.

Paste any link into the box at the top and press **Download**. That is all you need; the Chrome extension below is optional.

### Chrome extension (optional)

The extension adds a **⬇ Download** button on YouTube, Instagram and Facebook videos and a right-click menu for links.

1. From the same release page, download **`Raftaaro-Chrome-Extension-x.y.z.zip`** and unzip it into a folder you will keep (for example `Documents\Raftaaro Extension`). The extension is also in the install folder, under `resources\extension`.
2. In Chrome, open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose that folder.
4. In Raftaaro, open **Settings** and copy the **Chrome extension token**.
5. Click the Raftaaro icon in Chrome's toolbar (pin it from the puzzle-piece menu), paste the token, then click **Save** and **Test connection**.

### Updating

Download and run the newer installer; your settings and download list are kept.

## Build from source

Requirements: Windows, [Node.js](https://nodejs.org/) 22 or newer.

```bash
git clone https://github.com/Hamza-Bhai/Raftaaro-Downloader.git
cd Raftaaro-Downloader
npm install          # also downloads yt-dlp, ffmpeg and ffprobe into resources/bin, checking their SHA-256
npm run dev          # run the app in development mode
```

| Command             | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm test`          | Run the tests (Vitest)                         |
| `npm run lint`      | Lint with ESLint and Prettier                  |
| `npm run typecheck` | Type-check the main, preload and renderer code |
| `npm run build:win` | Build the Windows installer into `dist/`       |

## Privacy

Everything stays on your computer. The extension talks only to the app, on `127.0.0.1`, and every request must carry the token from the app's Settings. Logins the extension passes along are saved in the app's data folder, used only for YouTube, Instagram and Facebook, and can be turned off in Settings.

## Responsible use

Download only content you have the right to download. Respect copyright and the terms of service of the sites you use.

## Credits

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) (Unlicense) does the video extraction
- [FFmpeg](https://ffmpeg.org/) (LGPL build from [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds)) joins and converts streams

These programs are downloaded at build time and ship in the installer under their own licenses.

## License

[MIT](LICENSE)
