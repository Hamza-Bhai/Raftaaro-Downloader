# Security Policy

## Supported versions

Only the [latest release](https://github.com/Hamza-Bhai/Raftaaro-Downloader/releases/latest) gets security fixes. Please update before reporting.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report it privately through GitHub: go to the [Security tab](https://github.com/Hamza-Bhai/Raftaaro-Downloader/security) and click **Report a vulnerability**. Only the maintainer can see the report.

Please include:

- what the problem is and what an attacker could do with it
- steps to reproduce, or a proof of concept
- the Raftaaro version and Windows version

You should get a reply within 7 days. Once the problem is confirmed, a fix is released as soon as possible and you are credited in the release notes, unless you prefer not to be.

## Scope

Things that are especially worth reporting:

- a website or another program reaching the app's local API (`127.0.0.1`) without the token from Settings
- the Chrome extension leaking cookies or logins to anyone other than the app
- a download writing files outside the chosen download folder
- a way to make the app run a program it should not

Problems inside [yt-dlp](https://github.com/yt-dlp/yt-dlp) or [FFmpeg](https://ffmpeg.org/) themselves should be reported to those projects.
