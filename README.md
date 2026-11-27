## MUSICVERSE PRO

**Your sound, your universe.** A responsive, browser-based music workspace combining discovery-oriented navigation, personal-library management, a persistent player, queue controls, and synchronized user-supplied lyrics.

### Experience

- **Home and discovery** — editorial hero, mood-led entry points, recent listening, and personal-library summaries.
- **Personal library** — import local audio, search tracks, mark favorites, create playlists, rename them, and curate their contents.
- **Player** — play/pause, previous/next, seek, volume, shuffle, repeat-all, repeat-one, persistent queue, and keyboard shortcuts.
- **Lyrics Studio** — save plain-text lyrics or timestamped .LRC lyrics. Timestamped lines highlight with playback; selecting a line seeks to its position.
- **Persistence** — audio blobs are stored in IndexedDB; playlist metadata, likes, queue, recent history, and lyrics are stored in browser local storage.
- **Responsive workspace** — desktop navigation and lyrics/queue panel, compact slide-over panels, mobile player controls, and a light/dark appearance toggle.

### Run locally

Open index.html in a current browser, or serve this directory with any static web server. No build step or package installation is required. The Lucide icon set and web fonts are loaded from CDNs; the core application is vanilla HTML, CSS, and JavaScript.

### Audio and lyric formats

Audio is selected by the user and stays in the browser. Supported playback formats depend on the browser and operating system (commonly MP3, M4A/AAC, WAV, FLAC, OGG, and Opus). Imported audio is stored in IndexedDB when available. Browser storage can be cleared by the user or constrained by device quota, so it is not a substitute for a server backup.

Lyrics Studio accepts plain text and LRC timestamp lines such as:

~~~text
[00:12.40] First lyric line
[00:16.20] Second lyric line
[00:20.00] Third lyric line
~~~

Timed lines are synchronized to the local audio playback clock. This is a user-supplied lyrics editor, not an external licensed lyrics catalogue.

### Product boundaries

MUSICVERSE PRO is an original interface informed by interaction patterns from music discovery, streaming-library, and synchronized-lyrics products. It does not reproduce their proprietary interfaces or branding.

This repository does not scrape YouTube Music, Spotify, or Musixmatch, bypass subscriptions, or provide an unlicensed streaming catalogue. Connecting commercial catalogues, account sync, remote search/playback, and licensed synchronized lyrics requires official provider APIs, app credentials, user authorization, and the relevant commercial/API permissions. Those integrations are not represented as enabled here.

### Validation

GitHub Actions runs a JavaScript syntax check and verifies that the required application files are present on pushes and pull requests to main.

### Publish

The repository can be hosted as a static site (for example, GitHub Pages). Enable Pages in Settings → Pages and choose the main branch with the repository root as the publishing source. Hosting availability depends on repository/account Pages settings.

### Project structure

~~~
musicverse-pro/
├── .github/workflows/verify.yml
├── assets/favicon.svg
├── css/style.css
├── js/app.js
├── index.html
├── manifest.webmanifest
└── README.md
~~~
