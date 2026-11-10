# ORBIT Mobile 3.1 — iPhone / Android PWA

Built from the ORBIT 3.1 project with the mobile layout and ORBIT core animation preserved.

## What's in this phone version

- Home dashboard with animated ORBIT core, reminder summary, recent notes and weather preview.
- Reminders: create, edit, delete, complete; once, daily, weekdays and custom-day recurrence.
- Spoken reminders in English or Romanian using **the phone's built-in voices**, only while the app is running and allowed to play audio.
- Browser/OS notification on due reminders **while the app is running**, if notification permission is granted.
- Notes: create, edit, search, pin, delete, local autosave.
- Weather: city search, conditions and 3-day forecast via Open-Meteo (requires internet).
- Appearance accents; English/Romanian selection (used for voice and date format).
- Offline-ready Progressive Web App and a built-in update checker/service worker.
- Local JSON backup export/import.

**Removed:** timers, presets/Windows app launchers, CPU/GPU/RAM/system monitoring, microphone, wake-word, voice commands, voice chat, cloud accounts, Google News.

## IMPORTANT: reminder limitations

This is a static, local-first PWA. Timed reminders and spoken announcements run only **while ORBIT is open and the phone allows it to execute scripts/audio**. A locked iPhone or a closed PWA cannot be relied upon to speak or notify at the scheduled time. The notification permission button does not turn this into a remote push service. Reliable locked-phone alerts require a native mobile app with local notifications, or web push backed by a server; background speech is not available from a service worker. Do not use this version for critical alarms.

On iPhone, Romanian audio requires an appropriate Romanian system voice; availability and playback behavior vary by OS version. The app requests `ro-RO`, but cannot install missing voices. English is the default.

This package contains NO account system, server, encryption sync, Windows data syncing, or hidden API keys. Notes and reminders are saved on the mobile browser/PWA's device storage, and are not automatically shared with Windows ORBIT.

## Upload to GitHub Pages

1. Make a new GitHub repository, e.g. `orbit-mobile` (separate from `orbit-windows`).
2. Upload **the files inside this folder** directly into the **root** of the repository. Keep `index.html`, `main.js`, `style.css`, `service-worker.js`, `manifest.webmanifest` and `icons/` at the root.
3. GitHub repo → **Settings → Pages** → under **Build and deployment**, choose **Deploy from a branch** → `main` and `/ (root)` → **Save**.
4. Open the GitHub Pages URL GitHub displays once it is published (usually `https://YOUR-USERNAME.github.io/orbit-mobile/`). GitHub Pages provides HTTPS, required for the updater and PWA.
5. iPhone: open the URL in **Safari**, tap Share → **Add to Home Screen**, then launch ORBIT from the Home Screen.
   Android: open in Chrome, then select **Install app** / **Add to Home screen** if offered.
6. Open ORBIT → **Settings** → **Enable notification permission** (where supported). Leave the app open to receive due-time voice alerts.

You do **not** need Xcode, Android Studio, a Supabase project, a cloud account, or an external voice API to use this PWA.

## Updating ORBIT Mobile later

The updater is **already implemented**. It works via the web app's service worker. Upload the newer files to the SAME GitHub Pages repo/path, changing both:

- `CACHE_VERSION` in `service-worker.js`, e.g. to `orbit-mobile-3.1.1-v1`
- `VERSION` in `main.js` and the visible version labels if you release a new version.

Then open ORBIT on the phone. It checks automatically on launch, on returning to the app and hourly while running, and also has a **Settings → Check for updates** button. If a new worker is waiting, ORBIT shows an **Update** banner; tap it to activate and reload. Updates do not delete localStorage, so notes and reminders remain provided the GitHub Pages URL/origin stays the same and the user hasn't cleared app/site data. Export a backup before major changes.

GitHub Pages must finish publishing new files before clients can receive them. If publishing to a different URL or repo, your old local device data won't follow automatically.

## Testing locally

The PWA must be served over HTTP(S), not opened directly as `file://`. From the folder, run `python -m http.server 8000` and visit `http://localhost:8000`. For iPhone/Android use a published HTTPS URL. The updater cannot run correctly from local files.

## Security & privacy

No login, tracking analytics, cloud storage, or remote transcription. Weather queries go directly to Open-Meteo. Exported backups are plain JSON and may contain private notes: store them securely. `localStorage` is device/browser-specific and can be deleted if the browser's website data is cleared.
