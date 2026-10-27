# Raftaaro

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

- A "⬇ Download" button on YouTube, Instagram and Facebook videos
- Right-click any link → "Download with Raftaaro"
- Can pass your YouTube, Instagram and Facebook login to the app, so videos that need a login work and YouTube does not treat you as a bot

**Also**

- Offers to download a link you copy to the clipboard
- Queue with a limit on parallel downloads; YouTube downloads run one at a time with pauses, and back off automatically when YouTube asks
- Keeps running in the tray while downloads are active
- Updates yt-dlp by itself

## Install

Download the latest `Raftaaro Setup x.y.z.exe` from [Releases](https://github.com/Hamza-Bhai/Raftaaro-Downloader/releases) and run it.

### Chrome extension

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose the `extension` folder (in the install folder under `resources\extension`, or in this repository).
3. In Raftaaro, open **Settings** and copy the **Chrome extension token**.
4. Click the Raftaaro icon in Chrome, paste the token, then **Save** and **Test connection**.

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
