## MUSICVERSE PRO

**Your sound, your universe.** A responsive, browser-based music workspace combining discovery-oriented navigation, personal-library management, a persistent player, queue controls, and synchronized user-supplied lyrics.

### Experience

- **Home and discovery** — editorial hero, mood-led entry points, recent listening, and personal-library summaries.
- **Personal library** — import local audio, search tracks, mark favorites, create playlists, rename them, and curate their contents.
- **Player** — play/pause, previous/next, seek, volume, shuffle, repeat-all, repeat-one, persistent queue, and keyboard shortcuts.
- **Lyrics Studio** — save plain-text lyrics or timestamped .LRC lyrics. Timestamped lines highlight with playback; selecting a line seeks to its position.
- **Persistence** — audio blobs are stored in IndexedDB; playlist metadata, likes, queue, recent history, and lyrics are stored in browser local storage.
- **Responsive workspace** — desktop navigation and lyrics/queue panel, compact slide-over panels, mobile player controls, and a light/dark appearance toggle.
- **Installable shell** — web app manifest and a service worker that caches the core interface for offline reopening after the first successful load.

### Run locally

Open index.html in a current browser, or serve this directory with any static web server. No build step or package installation is required. The Lucide icon set and web fonts are loaded from CDNs; the core application is vanilla HTML, CSS, and JavaScript. Serve over HTTPS (or localhost) to enable the service worker and install flow.

### Audio and lyric formats

Audio is selected by the user and stays in the browser. Supported playback formats depend on the browser and operating system (commonly MP3, M4A/AAC, WAV, FLAC, OGG, and Opus). Imported audio is stored in IndexedDB when available. Browser storage can be cleared by the user or constrained by device quota, so it is not a substitute for a server backup.

Lyrics Studio accepts plain text and LRC timestamp lines such as:

~~~text
[00:12.40] First lyric line
[00:16.20] Second lyric line
[00:20.00] Third lyric line
~~~

Timed lines are synchronized to the local audio playback clock. This is a user-supplied lyrics editor, not an external licensed lyrics catalogue.

### Federated catalogue connectors

The search workspace queries four independent providers and normalizes their results into a common track/station record while retaining the original provider identity:

- **Audius** — track discovery and streaming through its documented REST endpoints. Stream-gated records are sent to Audius rather than played as unrestricted audio.
- **Apple Music / iTunes Search** — catalog metadata and promotional song previews. A preview is accompanied by a link back to the corresponding Apple store listing, as required by Apple's Search API terms.
- **Radio Browser** — live radio station discovery and playback when a checked HTTPS stream URL is available. Stations with insecure or unverified stream URLs are shown as external links instead.
- **Internet Archive** — searchable audio-item metadata and item pages. Results open the original archive record; the app does not assume that every recording is reusable or streamable.

Search results show a source badge and a playback action only when the adapter has a usable playback URL. Source outages are isolated, so one unavailable catalogue does not block other results. The local library remains separate from remote catalogue results; remote tracks are not silently imported or written to IndexedDB.

Spotify and YouTube are deliberately not presented as active catalogue connectors yet. Spotify requires a user-authorized OAuth flow and its current developer-mode access restrictions; YouTube catalogue search requires a project API key and its own quota. No credentials are embedded in this public static repository, and YouTube audio is not extracted from videos. MusicBrainz can be added as a metadata enrichment source behind a rate-limited cache; its public service permits only one request per second per application.

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
├── sw.js
├── scripts/check-app.mjs
├── index.html
├── manifest.webmanifest
└── README.md
~~~
