# Contributing to Raftaaro

Thanks for wanting to help. Bug reports, ideas and pull requests are all welcome.

## Reporting a bug or asking for a feature

Open an [issue](https://github.com/Hamza-Bhai/Raftaaro-Downloader/issues/new/choose) and pick the matching form. For a bug, include:

- the Raftaaro version (Settings, or the installer's file name)
- your Windows version
- the link you tried, if it is public
- what you expected and what happened instead

Do not report security problems in a public issue. See [SECURITY.md](SECURITY.md).

## Setting up the project

Requirements: Windows, [Node.js](https://nodejs.org/) 22 or newer.

```bash
git clone https://github.com/<your-username>/Raftaaro-Downloader.git
cd Raftaaro-Downloader
npm install          # also downloads yt-dlp, ffmpeg and ffprobe into resources/bin
npm run dev          # run the app in development mode
```

To try the Chrome extension while developing, load the `extension` folder with **Load unpacked** in `chrome://extensions`.

## Making a change

1. [Fork](https://github.com/Hamza-Bhai/Raftaaro-Downloader/fork) the repository and create a branch from `main`, for example `fix/shorts-button`.
2. Keep the change focused on one thing. Open an issue first for a large change, so we can agree on the approach before you spend time on it.
3. Add or update tests in `tests/` when you change behaviour.
4. Before you push, make sure these pass:

   ```bash
   npm run lint
   npm run typecheck
   npm test
   ```

5. Open a pull request against `main` and fill in the template.

## Commit messages

Use short messages in the [Conventional Commits](https://www.conventionalcommits.org/) style, as the history already does:

```
feat: add a speed limit setting
fix: Download button on YouTube Shorts
docs: explain how to load the extension
```

## Code style

Prettier and ESLint decide formatting; run `npm run format` to apply it. Write code that matches the code around it.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
