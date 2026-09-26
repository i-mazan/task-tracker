# TaskFlow PWA

A standalone, offline-friendly task board with browser-local storage and JSON backup/restore.

## Install

1. Upload **all files and folders** in this ZIP to an HTTPS static host, such as GitHub Pages or Netlify. Keep the directory structure intact.
2. Open the hosted `index.html` in Chrome, Edge or Safari. Use the browser's **Install app** or **Add to Home Screen** option (availability varies by browser/platform).
3. Visit once online; the service worker then caches the app for offline use. Test offline mode after the first successful visit.

For local development, run `python -m http.server 8000` inside this folder and visit `http://localhost:8000`. Opening `index.html` via `file://` does not enable service workers/PWA installation.

## Backups and migration

On **All tasks**, select **Download backup** to save tasks and Brain dump ideas as a JSON file. Select **Import backup** to restore it. Import **replaces** existing tasks and ideas after confirmation. Download a backup first if you need the current data.

To transfer data from a previous standalone HTML version, open the old HTML file in its original browser/location, export its browser storage with the browser developer console (or use an HTML version with the backup feature), then import into the hosted PWA. Storage from an unrelated `file://` URL cannot be accessed automatically by the hosted PWA.

The browser stores data locally via `localStorage`; no account, cloud sync or automatic external backup is provided. Clearing site data or switching devices can lose data unless you exported a backup.
