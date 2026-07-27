# Movies & TV Recaps Maker — Desktop (Windows)

A standalone Windows desktop app, built with Electron, that reuses the same
recap-creation flow as the website (video selection, title/description →
Gemini script generation, FFmpeg cutting) but processes video with a **real,
native FFmpeg binary** instead of the browser's FFmpeg.wasm engine.

This is why it exists: the website intentionally runs FFmpeg.wasm
single-threaded (see the main project's `CHANGELOG.md` for why — enabling
multi-threaded WASM requires cross-origin isolation headers that risk
breaking other embedded scripts). A native desktop process has no such
constraint, so this app runs FFmpeg with `-threads 0` (all available CPU
cores), which is what actually fixes the slowness on long or high-resolution
videos.

This folder is **fully independent** of the website app in `../src` — its
own `package.json`, its own dependencies, its own build. It is not imported
by, or exported to, the website build in any way, and this app is developed
on a separate git branch that is **not merged into `main`**.

## What's different from the website version

- FFmpeg runs as a native OS process (via [`ffmpeg-static`](https://www.npmjs.com/package/ffmpeg-static)), not WebAssembly — no 4GB WASM memory ceiling, no browser sandboxing overhead, uses all CPU cores (`-threads 0`).
- No upload size cap — the video never gets "uploaded" anywhere, it's read straight off disk by the local FFmpeg process.
- Video picking, saving, and duration probing go through native OS dialogs and `ffmpeg -i` instead of browser APIs.
- The UI is a single-language (English) Electron window, not the full multi-language (6 languages) React site — it only carries a "script language" selector so Gemini can still generate the voice-over script in Hebrew, Russian, Arabic, Spanish, or French.
- No Blink storage / history / stats / AdSense — this is a local, offline-first tool. Recaps are saved directly to disk via a native "Save As" dialog.

Everything else — the FFmpeg filter graph (`select`/`setpts`/`scale`), the
x264 encode settings, and the Gemini prompt — is copied as-is from the
website's `src/components/HomePage.tsx` so behavior matches.

## Running in development

```bash
cd desktop-app
npm install
npm start
```

This opens an Electron window pointed at `src/renderer/index.html`. Paste a
Gemini API key, pick a video file, fill in title/description, and click
**Create Recap**.

## Building a Windows installer

```bash
cd desktop-app
npm install
npm run dist          # builds both an NSIS installer and a portable .exe
# or just one target:
npm run dist:portable
```

Output lands in `desktop-app/release/`.

### Important caveats about building for Windows

1. **Cross-compiling from Linux/macOS needs Wine.** `electron-builder`'s
   Windows NSIS target is built with Wine when you're not running on
   Windows itself. If `npm run dist` fails with a Wine-related error, either
   install Wine (`sudo apt install wine`) or — the more reliable option —
   run `npm install && npm run dist` directly on a Windows machine (or a
   Windows CI runner, e.g. `windows-latest` on GitHub Actions).

2. **The bundled `ffmpeg` binary matches the platform it was installed
   on.** `ffmpeg-static`'s postinstall script downloads a binary for the
   *current* OS/arch by default. If you `npm install` on Linux and then
   cross-build for Windows, the app will ship a Linux ffmpeg binary that
   won't run on Windows. Force it to fetch the Windows binary before
   packaging:

   ```bash
   npm_config_platform=win32 npm_config_arch=x64 npm rebuild ffmpeg-static
   npm run dist
   ```

   (Building directly on a Windows machine avoids this entirely — it just
   works, since `os.platform()` is already `win32`.)

3. **No code signing is configured.** The resulting `.exe`/installer is
   unsigned, so Windows SmartScreen will show an "unrecognized publisher"
   warning on first run. That's expected for an unsigned build; a real
   release would need an Authenticode code-signing certificate configured
   in `electron-builder`'s `win.certificateFile`/`certificatePassword`.

## Project layout

```
desktop-app/
├── package.json          # electron-builder config lives here (build.win, nsis)
├── README.md              # this file
└── src/
    ├── main.js             # Electron main process: window, IPC handlers, FFmpeg spawning
    ├── preload.js           # contextBridge - the only API surface exposed to the renderer
    └── renderer/
        ├── index.html
        ├── style.css
        └── renderer.js       # UI logic + Gemini script generation (same prompt as the website)
```

## Security notes

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on the
  `BrowserWindow` — the renderer has zero direct Node/filesystem access; it
  can only call the specific IPC methods exposed in `preload.js`
  (`selectVideo`, `getVideoDuration`, `createRecap`, `saveVideoAs`,
  `copyFile`, `showInFolder`, `getTempPath`).
- A strict `Content-Security-Policy` meta tag in `index.html` restricts the
  renderer to loading its own local files plus `fetch()` calls to
  `generativelanguage.googleapis.com` (the Gemini API) — nothing else.
- The Gemini API key is only ever held in memory in the renderer for the
  current session; it's not written to disk anywhere.
