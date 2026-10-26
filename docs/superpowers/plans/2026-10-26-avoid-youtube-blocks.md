# Avoid YouTube Blocks — Plan

**Goal:** Keep YouTube from rate-limiting the user's IP ("Sign in to confirm you're not a bot", HTTP 429) and recover by itself when it happens. User requirement: videos must download without issues and the IP must not get blocked.

**Approach:** Fewer and slower requests, self-healing on a block, a fresh yt-dlp, and a real YouTube login sent by the extension (Chrome's own cookie file is locked while Chrome runs).

## Decisions

- **Rate-limit detection:** stderr matching `HTTP Error 429`, `Too Many Requests`, `not a bot`, `rate-limit` → `RATE_LIMIT_MESSAGE`. "Private video"/"login required" stay the sign-in message.
- **Pacing (yt-dlp args, YouTube URLs only):** `--sleep-requests 1 --sleep-interval 3 --max-sleep-interval 8`.
- **Concurrency:** at most `1` YouTube job runs at a time (other sites and files still follow `maxConcurrent`).
- **Cooldown:** a job failing with `RATE_LIMIT_MESSAGE` goes back to `queued` with `retryAt = now + 10 min`; while any cooldown is active no YouTube job starts. Up to `2` automatic retries, then `error`. Card shows "Waiting — YouTube asked us to slow down (retrying at hh:mm)".
- **yt-dlp auto-update:** on app start, if the last update is older than 24 h, run `yt-dlp -U` in the background and record `lastYtDlpUpdate` in settings.
- **Extension login:** extension (`cookies` permission + `*://*.youtube.com/*`) sends YouTube cookies with each YouTube link; app writes them as a Netscape cookie file `youtube-cookies.txt` in userData and passes `--cookies <file>` for YouTube URLs (probe and download). Setting `useExtensionLogin` (default **on**). `useChromeCookies` takes precedence when on. Local API body limit raised to 256 KB.

## Tasks (TDD each)

1. `classifyYtDlpError` → rate-limit message; `buildDownloadArgs`/`probe` add pacing for YouTube only. Tests in `tests/ytdlp.test.ts`.
2. `DownloadQueue`: YouTube concurrency 1, cooldown + retries (`Job.retryAt`, `Job.attempts`). Tests in `tests/queue.test.ts` with fake timers.
3. `shouldUpdateYtDlp(last, now)` + startup wiring. Test in `tests/bins.test.ts` (pure function in `src/main/video/update-policy.ts`).
4. `toNetscapeCookies(cookies)` (`src/main/video/cookies.ts`), local API accepts `cookies`, ytdlp uses `--cookies` file. Tests in `tests/cookies.test.ts`, `tests/local-api.test.ts`, `tests/ytdlp.test.ts`. Extension + Settings toggle.
