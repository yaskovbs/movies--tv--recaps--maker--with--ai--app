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

## Learning from usage over time (step 1: rating + few-shot examples)

- Gemini's actual model can't be made to learn automatically from this app's usage - the public API has no such hook. What's implemented instead is a real, working improvement loop entirely within the app: a 👍/👎 rating on each saved recap in History (`recapStorageService.rateRecap`), and `recapStorageService.getGoodExamples()`, which pulls a user's own "up"-rated past recaps (preferring the same genre) and feeds their scripts into the prompt as few-shot examples for that user's next recap - so the app actually improves from what a user has personally found good, without needing to retrain or fine-tune anything.
- Non-fatal and per-user: if the user isn't authenticated or has no rated recaps yet, this silently contributes nothing extra to the prompt - no behavior change.

## Learning from usage over time (step 2: real fine-tuning)

- Added `src/lib/geminiTuning.ts` and a "Personalized AI model" card at the top of History. Once a user has 15+ recaps rated "up", they can click "Start training" to kick off a real Gemini supervised fine-tuning job (`POST /v1beta/tunedModels`) using those recaps as training data (title/genre/description → script pairs), authenticated with their own API key - no separate Google Cloud project or service account needed.
- The base model to tune is discovered dynamically (`GET /v1beta/models`, filtered for `supportedGenerationMethods` containing `createTunedModel`) rather than hardcoded, since tuning support varies by API key/project.
- Training is a genuinely long-running job (minutes to hours), so this doesn't block the UI - History checks the job's status once whenever it loads (`refreshTuningJobStatus`, tracked in a new `tuning_jobs` Blink DB table) rather than polling in a loop. Once a job reports `ready`, `HomePage` automatically uses that tuned model (`tunedModels/xxx`) instead of the base model for future script generation - but only for recaps with no attached video/audio file, since the tuned model comes from a text-only pipeline and isn't expected to handle multimodal `file_data` parts reliably.
- **Known uncertainty, called out explicitly**: Google's fine-tuning story has been shifting toward its Vertex AI / "Gemini Enterprise" platform (GCP project + service-account auth), which this app's simple "paste your API key" model can't use. The plain API-key `tunedModels` endpoint this code targets does still exist per Google's public API definitions as of this writing, but it may only support certain base models, may be restricted for some projects, or could be phased out over time. Every step here (base-model discovery, job creation, status polling) is written to fail non-fatally with a clear error rather than break anything - if tuning isn't available for a given API key, the app simply keeps using step 1's few-shot approach.
- Fully translated across all 6 languages (key parity verified against en.json).

## Optional sign-in (email + password, no Google)

- Added `AuthPanel` in the header: a simple email/password sign-in and sign-up form (Blink SDK's `signUp`/`signInWithEmail`, no OAuth/Google button on purpose, per an explicit request to keep it minimal). Switched `blink.ts` from `mode: 'managed'` (redirects to Blink's hosted auth page, never actually triggered anywhere in the app) to `mode: 'headless'`, which is what this custom in-app form needs.
- Signing in is entirely optional - the site works the same without it. What changes if you do: your saved recaps/ratings follow your account across devices/browsers instead of staying tied to one browser, and the personalized fine-tuning feature (previous entry) becomes available.
- **Fixed a real bug this uncovered**: `blink.auth.me()` throws instead of resolving to `null` when nobody is signed in, which is the *normal* state here - and since there was never any way to sign in at all before this change, every call site that awaited it directly (`RecapSaver`'s save handler, `recapStorage.saveRecap`/`getRecaps`) was throwing on every single call, not gracefully falling back the way the code appeared to intend (`(await blink.auth.me())?.id || 'anonymous'` doesn't catch a *rejected* promise - only a resolved falsy one). This is almost certainly what "לא שומר לי את הסיכומים... מגיעה אלי שגיאה" (recaps won't save, I get an error) was.
- Added `getCurrentUser()` (catches that throw, returns `null`) and `getEffectiveUserId()` (signed-in user's real ID, or a stable per-browser anonymous ID generated once into `localStorage` - not a single shared `'anonymous'` bucket everyone would collide into) to `lib/blink.ts`, and switched `recapStorage.ts`/`RecapSaver.tsx`/`geminiTuning.ts` to use them. Saving/rating/history/few-shot examples now all work with zero sign-in required; only starting a fine-tuning job still asks for a real account, since that's a multi-hour job worth tying to something more durable than one browser's local storage.
- Fixed a real layout bug found while building this: adding the new header button pushed mobile width past 390px (real overflow, confirmed via a live browser check) - language/sign-in/API-key buttons now collapse to icon-only below the `sm` breakpoint, same treatment across all three so none of them get cut off on a phone.
- Fully translated across all 6 languages (key parity verified against en.json).

## Fixed the actual root cause of "recaps won't save" (mobile blob eviction)

- A user's screenshot (after the sign-in fix above) narrowed the generic "Failed to fetch" down to the video-read step specifically, not the upload - `RecapSaver` was calling `fetch(videoUrl)` on the recap's `blob:` URL to re-derive a `Blob` for uploading. A `blob:` URL only works as long as the browser's internal blob registry still has that data; it can evict it - especially on mobile, under memory pressure or after the tab is backgrounded - well before the JS `Blob` object itself (still referenced in React state) would ever be garbage-collected. That's a very plausible explanation for a phone-specific "works right after generating, fails a bit later when saving."
- Fixed properly rather than working around it: `RecapOutput` now carries the actual `Blob` (`videoBlob`) alongside `videoUrl` (still used for the `<video>` preview/download), and `RecapSaver` uploads that `Blob` directly - no `fetch()` of the blob URL at all anymore, so this whole failure class is gone rather than just producing a clearer error message for it.
- typecheck/lint/build clean; full route QA pass shows no page errors.

## Migrated from Blink to Supabase (auth, database, storage)

- Replaced `@blinkdotnew/sdk`/`@blinkdotnew/react` with `@supabase/supabase-js` entirely - database, file storage, and auth all now run on Supabase instead of Blink. Root cause: a live-site CORS failure (`Access-Control-Allow-Credentials` missing on Blink's response for this site's actual Cloudflare Pages origin) was confirmed via a real browser console capture, blocking every save. Rather than depend on a third-party dashboard setting we don't control, switched providers.
- **New file `supabase/migrations/20260809120000_initial_schema.sql`** (a real Supabase CLI migration, not just a loose SQL file) - `recaps` and `tuning_jobs` tables with Row Level Security policies keyed to `auth.uid()`, plus a public `recaps` storage bucket. Run it either by pasting into Supabase's SQL Editor once, or automatically via the GitHub integration (see below). See the README's new "הגדרת Supabase" section for the full setup walkthrough (create project → enable anonymous sign-ins → run the schema → set `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`).
- **Added the `supabase/migrations/` folder structure (+ a minimal `supabase/config.toml`) specifically so Supabase's GitHub integration has something real to apply** - the user was looking at enabling it and, before doing so, this repo had no `supabase/` directory for the integration to sync from, so it would have connected successfully but done nothing useful. Documented in the README with an explicit warning to leave **"Automatic branching" off**: that feature provisions a full separate database per pull request, and Supabase's own UI flags it as compute not covered by a free Spend Cap - real money, for a feature this project has no use for. "Deploy to production" alone (migrations-only, on merge to the production branch) is free and is what's actually wanted here.
- **Optional sign-in is actually more capable now than it was on Blink**: `ensureSession()` (`lib/supabase.ts`) uses Supabase's built-in anonymous sign-in to give every visitor a real, backend-recognized user ID (not just a client-generated `localStorage` string), which Postgres RLS policies can check directly. When someone signs up with email/password, `supabase.auth.updateUser()` *upgrades that same anonymous session in place* - their existing anonymous history carries over onto the new account automatically, rather than starting a separate empty account.
- Renamed `src/lib/blink.ts` → `src/lib/supabase.ts`; `RecapRecord`/`TuningJobRecord` are unchanged from the app's point of view (still camelCase), converted at the edges from Postgres's snake_case row shape.
- **Dropped feature**: Supabase has no built-in text-to-speech - recaps saved without a custom MP3 narration no longer get an auto-generated fallback voice-over audio file (the video itself, and the script text, are unaffected either way).
- **Found and fixed a real crash bug while wiring this up**: `createClient()` throws synchronously on an empty URL, which would take down the *entire app* before it even renders if `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` aren't set yet - verified this in Node directly. Falls back to a syntactically-valid placeholder URL instead, so an unconfigured deployment degrades to "save/sign-in don't work" (with a clear console error) rather than a blank page; verified live that every route still loads with zero page errors even with Supabase completely unconfigured.
- typecheck/lint/build all clean; full route + interaction QA pass shows no regressions from the swap.

## Google AdSense

- Added the AdSense loader script to `index.html`'s `<head>`. Since this is a single-page app, one `index.html` serves every route, so this covers the whole site automatically.

## Internationalization (i18n)

- Added `i18next` + `react-i18next` + `i18next-browser-languagedetector`.
- Every user-facing string across all 14 components was extracted into translation files: `src/locales/{en,he,ru,ar,es,fr}.json`.
- First-time visitors get their **browser/OS language auto-detected** (falling back to English if it isn't one of the six supported languages); a language switcher in the header lets anyone override it to English, Hebrew, Russian, Arabic, Spanish, or French. Once someone picks a language manually, that choice is saved to `localStorage` and always wins over auto-detection on future visits. (This replaced an initial version that defaulted everyone to English regardless of browser language, per a follow-up request to auto-detect instead - e.g. a visitor with a Hebrew browser locale now gets Hebrew automatically.)
- Hebrew and Arabic are registered as RTL languages — `document.documentElement.dir`/`lang` flip automatically on language change, mirroring the entire layout correctly (verified visually).
- `index.html`'s static `<title>`/meta tags/`lang`/`dir` were updated to English defaults (these render before the JS app mounts, so they can't be driven by i18next).

## Automatic Gemini API key validation

- The header's API key panel now checks whether the entered Gemini key is actually valid, automatically — no need to click "Create Recap" and wait for it to fail partway through.
- Added `src/lib/gemini.ts` with `validateGeminiApiKey()`, which calls the quota-free `GET /v1beta/models` list endpoint (never `generateContent`), so checking a key costs no generation tokens.
- `Header.tsx` debounces the check 800ms after the user stops typing, guards against a slow/stale check overwriting a newer one if the key changes again mid-request, and shows three states: a spinner while checking, a green checkmark + message when valid, and a red X + Google's actual error message when invalid (e.g. "API key not valid. Please pass a valid API key."). The collapsed header button also gets a small green/red status dot so the state is visible even with the panel closed.
- Verified via the real endpoint directly (`curl`) that Google returns a structured `{error: {message: "..."}}` body for an invalid key, matching what the parsing code expects; verified live in the browser that the debounced "checking" state renders correctly with no console errors.

## Moved global usage stats from localStorage to Supabase

- The homepage's stats section (recaps created, active users, average rating) was reading and writing `localStorage` only - every number was per-browser, reset on any new device/incognito session, and never actually shared across real visitors, even though it looked like a live global counter.
- Added `supabase/migrations/20260812130000_app_stats.sql`: a single-row `app_stats` table (recap count, rating sum/count) and a `stats_visitors` table (one row per unique visitor UUID), both with RLS enabled. All writes go through `SECURITY DEFINER` RPC functions (`increment_recaps_created`, `add_app_rating`, `register_visitor`, `get_public_stats`) instead of direct table access, so a client can only move the numbers in valid atomic ways (e.g. "+1") and can never overwrite them to an arbitrary value.
- Added `src/lib/stats.ts` as the new client-side wrapper (replacing the deleted `src/lib/localStorage.ts`), used by `StatsSection.tsx` and `HomePage.tsx`. Each browser still keeps a locally-cached visitor UUID and a `hasRated` flag (so `App.tsx` only calls `register_visitor` once per browser and a visitor can't vote twice), but the actual counts now live in Supabase and are the same for every visitor.
- Degrades the same way the rest of the Supabase integration does: if `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` aren't set, stats silently show `0` instead of crashing (verified live with Supabase unconfigured - zero page errors).

## Always show whether Gemini actually watched the video

- The "Gemini watched the video and picked these moments" badge only ever appeared when it was true - when video analysis was skipped (file over the 2GB Gemini cap) or failed and the recap fell back to plain periodic sampling, there was no indication at all, leaving it ambiguous whether Gemini had watched it or the badge had simply been forgotten.
- `ResultsSection.tsx` now always shows one of two badges: the existing blue "watched" badge when `usedSmartSelection` is true, or a new gray "Gemini did not watch the video - moments picked by fixed interval" badge when it's false. Added the `resultsSection.smartSelectionBadgeNo` translation key across all 6 locales.

## Distinguish "watched but couldn't use it" from "never watched"

- The watched/not-watched badge previously collapsed two different situations into one "did not watch" message: (1) Gemini genuinely never received the video (too large for the 2GB File API cap, or the upload itself failed), and (2) Gemini's upload succeeded and it did look at the video, but the analysis call afterwards failed or returned no usable segments (bad JSON, empty result after filtering, etc). Case 2 was being reported as "did not watch," which wasn't accurate - it had watched, its output just couldn't be used.
- Added a `watchedVideo` flag to `RecapOutput` (`src/types/index.ts`), set from whether the Gemini File API upload itself succeeded, independent of `usedSmartSelection` (whether its picks were actually used to cut the recap). `HomePage.tsx` now threads this through even when the video-analysis step throws.
- `ResultsSection.tsx` now shows three distinct badges: blue "watched and cuts based on it" (`usedSmartSelection`), amber "watched, but its picks couldn't be used" (`watchedVideo` true, `usedSmartSelection` false), or gray "did not watch at all" (`watchedVideo` false). Added the `resultsSection.smartSelectionBadgeWatchedNotUsed` translation key across all 6 locales.

## Fixed the real reason Gemini "watching" the video almost always failed

- Root cause: after uploading a video to Gemini's File API, the file spends time in a `PROCESSING` state server-side before it can be analyzed. That processing time scales with the video's *length*, not its file size - a real movie or episode routinely takes several minutes, even when it's nowhere near the 2GB cap. The polling loop that waits for `ACTIVE` was budgeted for only 60 attempts × 1.5s = 90 seconds total, so almost any real movie/episode timed out here, threw, and silently fell back to plain periodic sampling - which is exactly what was being reported as "it almost always fails."
- `uploadFileToGemini()` (`src/components/HomePage.tsx`) now takes a time budget (`maxWaitMs`) instead of a small fixed attempt count. The video call site now budgets up to **10 minutes** instead of 90 seconds; the audio call site (narration files are short, so this was never the bottleneck there) keeps the same effective ~30 second budget as before.
- Added an `onWaiting` progress callback so the status message updates with elapsed time (`Gemini is still processing the video (2:15) - this can take a few minutes for longer videos...`) instead of sitting on a static message for up to 10 minutes, which would otherwise look frozen. Added the `home.status.uploadingVideoForGeminiElapsed` translation key across all 6 locales.

## Known limitations / things not done

- Multi-threaded FFmpeg (would meaningfully speed up long/large video processing) is implemented in git history but currently reverted — enabling it requires accepting the COOP/COEP cross-origin risk described above.
- Only 6 languages are translated so far; adding more is straightforward (copy an existing locale file, translate it, register it in `src/i18n/config.ts`) but each additional language was not done proactively.
- The old `.env.local` values remain visible in earlier git history even though the file is no longer tracked going forward.
