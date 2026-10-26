const DAY_MS = 24 * 60 * 60 * 1000

/** yt-dlp must stay current for YouTube to keep working; check for a new version at most once a day. */
export function shouldUpdateYtDlp(lastUpdate: number | undefined, now: number): boolean {
  if (!lastUpdate || lastUpdate > now) return true
  return now - lastUpdate >= DAY_MS
}
