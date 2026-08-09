# Changelog

Summary of the work done on this branch, in the order it happened. This is a running log of features, fixes, and decisions — including ones that were tried and then deliberately reverted.

## Cloudflare Pages deployment readiness

- Fixed ~90 pre-existing TypeScript errors: most came from unused shadcn/ui scaffolding files that referenced npm packages that were never installed (`react-day-picker`, `recharts`, `cmdk`, `vaul`, `react-hook-form`, and others). Removed everything not actually imported by the app, along with leftover Vite template files (`main.ts`, `counter.ts`, `style.css`, `typescript.svg`). This also shrank the shipped CSS from 62.5KB to ~24KB.
- Added the `@/*` path alias to `tsconfig.app.json` and `vite.config.ts` — it was declared in `components.json` but never actually wired up.
- Added `src/vite-env.d.ts` so `import.meta.env` is typed.
- Fixed a real runtime bug: `blink.db.recaps.*` doesn't exist on the Blink SDK (only `blink.db.table(name)` does). Recap save/load/delete were silently broken. Fixed in `src/lib/recapStorage.ts` and `HistoryPage.tsx`.
- Added `eslint.config.js` — `npm run lint` failed outright before this (no ESLint v9 flat config existed).
- Added `wrangler.toml`, a `deploy` npm script, `.node-version` (20), and an `engines` field for Cloudflare Pages. `public/_redirects` already provided the SPA fallback needed for React Router.
- Untracked `.env.local` from git (it contained the Blink project ID/publishable key) and added `.env.example` as a template. Note: the old commit history still contains the file — rotate the key if it's meant to be private.

## Design: glassmorphism UI

- Replaced flat `bg-gray-800/700/900` panels across every page with translucent, `backdrop-blur`-based "glass" panels (new utility classes in `src/index.css`: `.glass`, `.glass-strong`, `.glass-subtle`, `.glass-header`, `.glass-footer`, `.glass-input`).
- Added a fixed ambient background layer in `App.tsx` (blurred color blobs) so the glass panels have something to visually refract — without it, blur alone looks flat.
- Discovered and fixed a real bug while doing this: the shadcn `Button`/`Card`/`Dialog` components reference CSS variables (`--primary`, `--background`, `--border`, etc.) that were **never defined anywhere** in the project, meaning those components had been rendering fully transparent/invisible since the project was scaffolded. Added a proper `:root` variable block.

## AI script generation

- Switched the Gemini model from `gemini-2.5-pro` to `gemini-3.6-flash`.
- Made the "additional description" field mandatory (previously optional) and rewrote the prompt so the model relies primarily on the user's entered text rather than general/prior knowledge about the title — reduces hallucinated plot details.
- The script generation prompt now requests output in whichever UI language is currently selected (see Internationalization below), instead of being hardcoded to Hebrew.

## FFmpeg processing performance

- Fixed a listener leak: `ffmpeg.on('log'/'progress', ...)` were being re-registered on every recap created in the same session, stacking duplicate listeners on the shared FFmpeg instance.
- Capped output resolution to a max width of 1280px (`scale='min(1280,iw)':-2`) and switched the x264 encode preset from the default `medium` to `veryfast` with `-crf 26`, plus `-movflags +faststart` for quicker playback start. Verified against real ffmpeg on a synthetic 1080p/20s source: encode time dropped from 3.2s to 1.1s (~2.9x), output size roughly halved.
- **Investigated but reverted:** loading FFmpeg's multi-threaded core (parallel encoding across CPU cores). This requires serving the site with `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` headers, which can silently break any cross-origin resource that doesn't explicitly support CORS/CORP — including the site's `blink.new` script tag and, now, the Google AdSense script (see below). Implemented it once, verified the headers/isolation worked correctly in a live browser, then reverted it entirely at the user's request rather than carry that risk.
- **Why processing can still feel slow on longer videos:** the recap-sampling filter (`select='lt(mod(t,interval),capture)'`) has to fully decode the source video frame-by-frame from start to finish to evaluate which frames to keep — it cannot seek/skip. FFmpeg.wasm currently runs single-threaded (software decode, no GPU, one CPU core) because of the COOP/COEP tradeoff above, so a long or high-resolution source (e.g. a 2-hour 1080p/4K file) takes a genuinely long time to decode regardless of the encode-side speedups already shipped. The two levers that would meaningfully change this are (a) enabling the multi-threaded core (reverted, see above) or (b) users providing shorter/lower-resolution source files.

## Upload limits

- Raised the max upload size from 3GB to 3.5GB. The user's original ask was 5.5GB, but standard (non-memory64) WebAssembly has a hard 4GB linear-memory ceiling that the file bytes plus FFmpeg's own decode/encode buffers must fit inside — 3.5GB is a safety margin under that ceiling, not an arbitrary UI choice.

## Video length awareness

- `VideoUploader` now reads the uploaded video's duration via the browser's own `<video>` metadata (no FFmpeg needed for this) and displays it.
- `RecapSettings` shows the video's length next to the "cut every" field and auto-calculates a sensible interval value (`interval = videoLength / recapDuration`) whenever the video or the desired recap length changes, so evenly-spaced captures actually add up to the requested recap duration. The field stays manually editable. Warns if the chosen interval would only yield a single segment.

## Actually saving recaps

- `RecapSaver` was hardcoding `videoUrl: ''` — the generated video was never actually persisted, only the script and optional audio. It now uploads the video (fetched back from its local `blob:` URL) to Blink's persistent storage via `blink.storage.upload()` before saving the record, with the save button showing which stage it's in (uploading video / generating audio / saving).
- `HistoryPage` now shows a playable `<video>` preview and a download button for recaps that have a saved video.

## Optional custom voice-over (MP3)

- Added an optional MP3 upload step (`AudioUploader`, shown right after the video picker, before recap creation). If provided, it's muxed directly into the FFmpeg output as the recap's audio track (`-map 0:v -map 1:a -c:a aac -shortest`) instead of the recap staying silent (`-an`).
- `RecapSaver` now uploads that same original MP3 as the saved recap's `audioUrl` instead of generating a second, different-sounding text-to-speech narration - so History's existing "play/download audio" controls play back the user's actual narration when one was provided, matching what's embedded in the video.
- Gemini also actually listens to the file, not just the video: the MP3 is uploaded through Gemini's File API (resumable upload + poll until `ACTIVE`, since inline base64 audio is capped around 20MB per request and a narration track can exceed that) and referenced via `file_data`/`file_uri` in the same `generateContent` call used for the script, alongside the text description. Non-fatal if the upload/processing fails - falls back to generating the script from the text description alone, same as before.
- Fully translated across all 6 languages.

## Gemini watches the video and picks the segments itself

- Previously FFmpeg always cut evenly-spaced clips on a fixed timer (`select='lt(mod(t,interval),capture)'`) - neither FFmpeg nor Gemini ever looked at what was actually happening in the video; the only "understanding" came from the text description (and, since the MP3 feature above, the narration audio).
- Now, before any cutting happens, the source video (if 2GB or under - Gemini File API's per-file cap) is uploaded through Gemini's File API and Gemini is asked to actually watch it and pick chronological, non-overlapping moments worth including, returned as timestamps and trimmed to roughly the requested recap length. FFmpeg then cuts exactly those segments (`select='between(t,s1,e1)+between(t,s2,e2)+...'`) instead of the periodic fallback.
- Non-fatal at every step - file too large, upload failure, analysis failure, or an unparseable response all silently fall back to the original periodic sampling, so nothing breaks for any video.
- The same uploaded video (when analysis succeeded) is reused for the script-writing call too, alongside any narration audio, instead of uploading it to Gemini twice.
- Added a new "analyzing video" processing stage, and a small badge on the results video ("Gemini watched the video and picked these moments") shown when the smart selection was actually used. Translated across all 6 languages.
- Verified the new `between(t,...)` OR'd select-filter syntax and the JSON/timestamp-parsing + trim-to-target logic against a real ffmpeg binary and synthetic Gemini-shaped responses before wiring it into the FFmpeg.wasm call.

## Learning from usage over time (lightweight, step 1 of 2)

- Gemini's actual model can't be made to learn automatically from this app's usage - the public API has no such hook. What's implemented instead is a real, working improvement loop entirely within the app: a 👍/👎 rating on each saved recap in History (`recapStorageService.rateRecap`), and `recapStorageService.getGoodExamples()`, which pulls a user's own "up"-rated past recaps (preferring the same genre) and feeds their scripts into the prompt as few-shot examples for that user's next recap - so the app actually improves from what a user has personally found good, without needing to retrain or fine-tune anything.
- Non-fatal and per-user: if the user isn't authenticated or has no rated recaps yet, this silently contributes nothing extra to the prompt - no behavior change.
- Planned step 2 (not yet built): once enough rated examples accumulate, periodically run a real Gemini fine-tuning job on the collected data for a model genuinely trained on this app's own successful recaps, rather than only steering it via the prompt.

## Google AdSense

- Added the AdSense loader script to `index.html`'s `<head>`. Since this is a single-page app, one `index.html` serves every route, so this covers the whole site automatically.

## Internationalization (i18n)

- Added `i18next` + `react-i18next` + `i18next-browser-languagedetector`.
- Every user-facing string across all 14 components was extracted into translation files: `src/locales/{en,he,ru,ar,es,fr}.json`.
- First-time visitors get their **browser/OS language auto-detected** (falling back to English if it isn't one of the six supported languages); a language switcher in the header lets anyone override it to English, Hebrew, Russian, Arabic, Spanish, or French. Once someone picks a language manually, that choice is saved to `localStorage` and always wins over auto-detection on future visits. (This replaced an initial version that defaulted everyone to English regardless of browser language, per a follow-up request to auto-detect instead - e.g. a visitor with a Hebrew browser locale now gets Hebrew automatically.)
- Hebrew and Arabic are registered as RTL languages — `document.documentElement.dir`/`lang` flip automatically on language change, mirroring the entire layout correctly (verified visually).
- `index.html`'s static `<title>`/meta tags/`lang`/`dir` were updated to English defaults (these render before the JS app mounts, so they can't be driven by i18next).

## Known limitations / things not done

- Multi-threaded FFmpeg (would meaningfully speed up long/large video processing) is implemented in git history but currently reverted — enabling it requires accepting the COOP/COEP cross-origin risk described above.
- Only 6 languages are translated so far; adding more is straightforward (copy an existing locale file, translate it, register it in `src/i18n/config.ts`) but each additional language was not done proactively.
- The old `.env.local` values remain visible in earlier git history even though the file is no longer tracked going forward.
