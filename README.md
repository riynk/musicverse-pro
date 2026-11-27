# MUSICVERSE PRO

A responsive music-player prototype built with vanilla HTML, CSS and JavaScript. No build step is required.

## Features
- Responsive dark interface, animated visual accents and Lucide icons.
- Import and play audio files selected from your device.
- Search imported local tracks.
- Playback: play/pause, previous/next, seek, volume, shuffle and repeat.
- Like tracks, create playlists and keep recent history.
- Add and store your own lyrics locally per track.
- Drag-and-drop import and keyboard shortcuts (Space, Ctrl/Cmd + K).
- Installable web app manifest.

## Run locally
Open `index.html` in a modern browser, or serve this folder with any static web server.

## Publish with GitHub Pages
1. Open **Settings → Pages** in the repository.
2. Choose **Deploy from a branch**.
3. Select `main` and `/ (root)`, then Save.
4. Wait for the deployment URL.

## Important boundaries
This prototype plays audio files selected by the user. It does not scrape, download, or bypass paid music services. Streaming catalogs, licensed synchronized lyrics, user accounts and cloud sync require authorized provider APIs, credentials, and appropriate licensing. Local audio object URLs are temporary; files are not uploaded to a server. Likes, playlists and lyrics are stored in this browser.

## Structure
```
musicverse-pro/
├── index.html
├── css/style.css
├── js/app.js
├── assets/favicon.svg
├── manifest.webmanifest
└── README.md
```

No license has been selected yet. Add one when reuse terms are decided.