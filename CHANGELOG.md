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

## Local, browser-only fallback for "learn from usage" - works even when saving is broken

- The existing few-shot learning ("Learning from usage over time (step 1)") only worked through Supabase: it needed a recap to be saved, then rated from the History page - both of which depend on the Supabase save flow actually working. Since that was still failing for this user, the app never had any examples to learn from at all.
- Added `src/lib/localLearning.ts`: a second, fully independent source of few-shot examples stored directly in this browser's `localStorage` (`recordLocalExample`, `rateLocalExample`, `getGoodLocalExamples`). It doesn't touch Supabase, doesn't require signing in, and doesn't depend on the Save Recap dialog at all.
- `HomePage.tsx` now records every generated script into local storage immediately after generation (`recordLocalExample`), and merges local "up"-rated examples with any Supabase ones when building the few-shot prompt for the next generation (`generateScriptWithGemini`'s `goodExamples` parameter is now typed as a lightweight `ScriptExample` shape so both sources fit).
- `ResultsSection.tsx` now shows a quick thumbs up/down right under the generated script, rating that generation in local storage immediately - no save, no sign-in, no trip to the History page required. `RecapOutput` gained a `localExampleId` field to connect the two.
- This is per-device (it won't follow a user across browsers), but it means the "improves over time" feature now works in every case, not only once Supabase saving is fixed.

## Local fallback for the global stats too (recaps created / active users)

- Same problem as the few-shot learning fallback above, applied to the homepage's stats section: `getPublicStats`/`incrementRecapsCreated`/`addRating` only ever worked through Supabase, so while its migration/RPC functions weren't set up yet (or any single request just failed), the stats section had nothing to show and displayed zeros.
- `src/lib/stats.ts` now always keeps a local, per-device fallback counter in `localStorage` (`local_app_stats_fallback`) alongside every Supabase write, and `getPublicStats()` reads from Supabase when it's configured and the request succeeds, falling back to the local counter otherwise - it no longer returns `null`. `incrementRecapsCreated`/`addRating` no longer throw or silently no-op when Supabase fails; the local count always lands.
- This local fallback is inherently per-device (it can't reflect what other visitors are doing), but it means the homepage always shows real, non-zero numbers instead of stalling on Supabase setup being finished first.

## Accept Supabase's own NEXT_PUBLIC_* env var names too

- Supabase's dashboard "Connect" page hands out setup snippets written for Next.js (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - "publishable key" is Supabase's newer name for the anon key), which don't match this app's own `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` convention. Rather than requiring everything to be renamed in Cloudflare Pages, the app now accepts either set directly.
- Vite only inlines env vars into the client bundle if their name matches a configured prefix (`VITE_` by default) - `NEXT_PUBLIC_*` vars were previously invisible to `import.meta.env` no matter what was set in Cloudflare. Added `NEXT_PUBLIC_` to `envPrefix` in `vite.config.ts`, and `src/lib/supabase.ts` now reads `VITE_SUPABASE_URL || NEXT_PUBLIC_SUPABASE_URL` (and the equivalent for the key). Verified directly by building with only the `NEXT_PUBLIC_*` vars set and confirming both values actually land in the built JS bundle.
- Updated `.env.example` and the README's Supabase setup section to document both accepted naming options.

## Fixed a real Supabase security advisor warning on the recaps bucket

- Supabase's own security advisor flagged "Clients can list all files in this bucket" on the `recaps` storage bucket - a real issue, not a false positive. The bucket is already public, so fetching a known file by its public URL (all this app ever does, via `getPublicUrl()`) needs zero RLS policies. The broad `"Anyone can view recap files"` SELECT policy this app had been creating on `storage.objects` was only enabling the Storage list/query API (`storage.list()`), which this app never calls - so it did nothing useful while letting any unauthenticated client enumerate every file ever uploaded by every user.
- Removed that policy creation from `20260809120000_initial_schema.sql` (for fresh installs) and added `20260813120000_drop_public_storage_select_policy.sql` to drop it on databases that already ran the earlier version. Verified the app's actual storage usage (`src/lib/supabase.ts`) only ever calls `.upload()` and `.getPublicUrl()`, neither of which needs this policy - removing it changes nothing the app does.

## Fixed "Cannot read properties of undefined (reading '0')" during script generation

- Root cause found: `generateScriptWithGemini`'s response parsing did `data.candidates[0]?.content?.parts[0]?.text` - optional chaining on everything *except* `candidates[0]` itself. When Gemini returns a response with no `candidates` array at all (most commonly because it blocked the response outright, e.g. safety filters triggered by the movie's description/content), `data.candidates` is `undefined` and indexing `[0]` into it throws exactly this raw `TypeError`, which then surfaced verbatim as the error shown to the user (`שגיאה בעיבוד`) instead of anything explaining what actually happened.
- Fixed the optional chaining (`data.candidates?.[0]?.content?.parts?.[0]?.text`) and, when there's still no script, now reads `data.promptFeedback?.blockReason` and surfaces it in the thrown error (e.g. "Gemini blocked the response (reason: SAFETY). Try adjusting the description.") instead of a generic failure. Applied the same fix to `searchWebForMovieInfo` (same pattern, already caught so it wasn't crash-visible, but was silently swallowing the same information) and to the desktop app's equivalent code in `desktop-app/src/renderer/renderer.js`.

## Extended the Gemini video-processing wait budget to 22 minutes

- Raised the video upload's processing wait budget (see "Fixed the real reason Gemini 'watching' the video almost always failed" above) from 10 to **22 minutes**, for very long movies where Gemini's server-side processing still hadn't finished within 10 minutes.

## The video-watching/analysis step also gets up to 22 minutes now

- The 22-minute budget previously only covered the upload+server-side-processing step. The actual "watch the video and pick moments" call (`analyzeVideoSegmentsWithGemini`'s `generateContent` request) had no explicit timeout at all - it would wait on the browser's default (effectively indefinite) behavior, with no elapsed-time feedback, so a long analysis looked frozen with no indication of how long it might still take.
- Added the same pattern here: an `AbortController`-based 22-minute timeout (so it fails cleanly and falls back to periodic sampling instead of hanging indefinitely) plus a periodic elapsed-time status callback, matching the upload step. Added the `home.status.analyzingVideoElapsed` translation key across all 6 locales.

## Loosened Gemini's safety thresholds for legitimate movie/TV content

- A user hit `Gemini blocked the response (reason: PROHIBITED_CONTENT)` on an ordinary recap request. Movies/TV shows legitimately involve violence, crime, horror and other dark themes as part of the genre itself, and Gemini's default safety thresholds (`BLOCK_MEDIUM_AND_ABOVE`) routinely false-positive on completely ordinary plot descriptions and video content that's just describing/showing an existing, already-published work rather than generating original harmful content.
- Added `safetySettings` (all four adjustable categories set to `BLOCK_ONLY_HIGH` instead of the default) to every Gemini `generateContent` call in `HomePage.tsx` (script generation, video segment analysis, web search) and the desktop app's equivalent code, to cut down on these false-positive `SAFETY` blocks.
- **Important limitation, confirmed via Google's own docs**: this does *not* fix `PROHIBITED_CONTENT` blocks specifically - that's a separate, non-adjustable built-in protection (core-harm filters like child safety) with no API setting able to override it, unlike the four adjustable harm categories. Added `describeGeminiBlockReason()` so the app now gives accurate, distinct guidance for that case ("cannot be adjusted via settings... try rephrasing the title/description") instead of implying a settings change could help.

## Removed AI script generation entirely

- Per an explicit request ("Gemini shouldn't create a script at all - I don't use it anyway"), removed the whole voice-over script generation feature. Gemini's role in this app is now exclusively "watch the video and pick the best moments to cut" - it no longer writes any narration text.
- Removed from `HomePage.tsx`: `generateScriptWithGemini()`, `searchWebForMovieInfo()` (only ever fed the script prompt), the few-shot example fetching/merging (Supabase + local), the personal fine-tuned model lookup, and the local-learning recording call - the entire `'generating_script'`/`'generating_audio'` processing stages are gone, going straight from cutting the video to `'completed'`.
- Removed the now-pointless settings fields that only existed to feed the script prompt: `youtubeApiKey`, `youtubeLink`, `linkType`, `webSearch` (`RecapSettings` type + their UI in `RecapSettings.tsx`, including the always-unused-in-practice "YouTube Data API key" field).
- Removed the "Generated Script" and "Audio Voice-over" (browser TTS preview) sections from `ResultsSection.tsx`, since there's no script text to show or read aloud anymore.
- Deleted `src/lib/localLearning.ts` outright (its only purpose was recording/rating generated scripts for few-shot learning - zero callers left once script generation was removed).
- **Fixed a real bug this surfaced**: `RecapSaver` was estimating a saved recap's `duration` from `script.split(' ').length / 2.5` (word count as a proxy for spoken length) - with no script, that would always compute `0`. Added a proper `durationSeconds` field to `RecapOutput` (set from the actual requested recap length in `RecapSettings.duration`) threaded through `ResultsSection` → `RecapSaver`, so saved recaps get their real duration regardless of script text.
- `HistoryPage.tsx` now only shows the script-text quote block for older saved recaps that still have one; new recaps save with an empty `scriptText` and just don't show that block. The rating buttons and personal fine-tuning card are left in place since they still operate meaningfully on older recaps that do have real script text - only the *creation* of new AI scripts was removed, not the whole rating/fine-tuning history feature.
- Swept all 6 locale files for now-fully-dead translation keys (YouTube/web-search settings UI, script/audio result sections, script-related processing stages) - 29 keys removed per locale, verified full key parity across all locales afterward. Verified live that the settings UI no longer shows any YouTube/web-search fields and there are zero page errors.

## Hard cap on smart-selected clip length (copyright safety, non-negotiable)

- Per explicit request, Gemini's smart segment selection can still choose *which* moments matter, but each individual clip it picks is now hard-capped to `RecapSettings.captureSeconds` (1 second by default - the same "1 second every N seconds" style the periodic fallback already used), instead of the previous "roughly 1-4 seconds" the prompt allowed. Brief, widely-spaced flashes of the source rather than longer continuous clips are meaningfully safer with respect to copyright, regardless of how "important" a given moment is.
- This is enforced client-side by trimming every segment Gemini returns down to the cap (`analyzeVideoSegmentsWithGemini`'s new `maxClipSeconds` parameter) - the prompt asks for it too, but the model's reply is never trusted to comply on its own, so it's a hard constraint rather than a suggestion. Verified the clamping logic directly: segments up to 4 seconds long in the input are all trimmed to exactly the cap in the output.

## Brought back a like/dislike button on the result (without script generation)

- Removing script generation also removed the local few-shot rating UI that used to sit under the (now-gone) script text - leaving no way to react to a freshly created recap at all, which a user then flagged as missing.
- Added a simple thumbs up/down back to `ResultsSection.tsx`, right under the video's action buttons. Rather than reintroducing the old script-learning machinery (there's nothing left to learn from), it reuses the existing global rating already wired up in `src/lib/stats.ts` (`addRating`/`hasRated` - the same mechanism behind the homepage's own 5-star "rate our service" widget). It's a one-time signal per browser: whichever comes first, this button or the homepage widget, "uses up" the rating and both then show a thank-you state - avoids asking the same visitor to rate twice while still giving a way to react to each recap.

## Added ARCHITECTURE.md

- Added `ARCHITECTURE.md`: a full technical walkthrough of how the system actually works - the step-by-step recap creation flow, Gemini's role and safety settings, the Supabase data layer (auth, tables, RLS, storage, RPC functions), every fallback/resilience mechanism built up over this project's history, video processing constraints, i18n, deployment, and the `desktop-app/` folder's status. Linked from `README.md`.

## Switched the model to gemini-3.7-flash

- Updated the model used for video segment analysis from `gemini-3.6-flash` to `gemini-3.7-flash` in `src/components/HomePage.tsx` and the desktop app's equivalent code.

## Chat with the video

- Added a real chat interface for asking Gemini questions about the source video, right in the results view. Reuses the same Gemini File API upload already done for smart segment selection (`videoFileRef`) instead of uploading the video a second time - no extra wait, no extra upload cost.
- New `RecapOutput.geminiVideoFileRef` field (typed `GeminiFileRef`, moved from a local `HomePage.tsx` interface into `src/types/index.ts` so it can be shared) carries the uploaded file's reference through to `ResultsSection`, which only renders the chat when it's actually present (i.e. Gemini successfully received the video - same condition the watched/not-watched badge already reflects, so there's no redundant explanation needed when it's unavailable).
- New `src/components/VideoChat.tsx`: a standard chat UI (message bubbles, input box, Enter-to-send) backed by `gemini-3.7-flash`. Gemini's REST API is stateless, so every turn resends the full conversation history so far - the video file is attached only once, on the very first user turn, and every later turn is plain text (verified this exact behavior directly with a standalone test of the history-building logic).
- Moved `GEMINI_SAFETY_SETTINGS` and `describeGeminiBlockReason()` out of `HomePage.tsx` into `src/lib/gemini.ts` so both the recap-creation flow and the new chat feature share the same loosened safety thresholds and block-reason messaging instead of duplicating them.

## "Get a full recap" button right after uploading, before creating anything

- Added a one-click way to get a complete text recap of a video immediately after uploading it - before touching any recap settings or clicking "Create Recap". Distinct from the two other Gemini video features: segment selection (picks moments to *cut*, only runs during creation) and the video chat (open-ended Q&A, only appears *after* a recap exists). This is a single, complete "what happens in this video" summary, available as early as possible.
- New `src/components/FullVideoSummary.tsx`, rendered in `HomePage.tsx` right after `VideoUploader` whenever a file is selected. Uploads the video to Gemini itself (independent of the creation flow), shows live elapsed-time progress during the upload+processing wait (same pattern used elsewhere), then displays the full recap text with copy/regenerate actions.
- New `getFullVideoRecap()` in `src/lib/gemini.ts`. Also moved `uploadFileToGemini`, `guessVideoMimeType`, and `GEMINI_VIDEO_SIZE_CAP` out of `HomePage.tsx` into `src/lib/gemini.ts` so this new component and the recap-creation flow share the same upload logic instead of duplicating it.
- Verified live: the button renders in the correct position immediately after selecting a video file, and the "enter an API key first" error path works correctly when no key is set.

## Chat also available right after getting a full recap

- The video chat previously only appeared after a recap had been fully created (in `ResultsSection`). Added it to `FullVideoSummary.tsx` too, right after the full text recap is generated - reuses the exact same Gemini File API upload already done to write that recap, so no second upload happens.
- `FullVideoSummary` now keeps the `GeminiFileRef` from its own upload in state and renders `VideoChat` as a sibling card underneath the summary once it's ready. Verified live that the chat stays hidden until a summary actually exists, and that the button/summary UI is unaffected.

## Made Gemini upload failures actually diagnosable

- A user hit "Failed to start the file upload to Gemini." with no further detail, on every retry - the message was hardcoded identically regardless of the actual cause (bad/invalid API key, key missing File API access, quota, file size/type issues, etc), so there was no way to tell what was actually wrong.
- `uploadFileToGemini()` in `src/lib/gemini.ts` now reads the failed response's actual body and includes it in the thrown error (`Failed to start the file upload to Gemini: HTTP 400 - API key not valid. Please pass a valid API key.`, for example) instead of a generic message. Verified directly against the real endpoint with `curl` that Gemini returns a structured `{error: {message: "..."}}` body on failure, and that the new parsing extracts it correctly. Applies to both the upload-start and the upload-bytes requests, and to every feature that uploads video (segment selection, the video chat, and the full-recap button) since they all share this one function.

## Fixed the root cause of the Gemini upload quota errors: files were never deleted

- The improved error message above revealed the real cause of repeated `HTTP 429` upload failures: `Quota exceeded for metric: generativelanguage.googleapis.com/file_storage_bytes, limit: 21474836480` - exactly 20GB. This is a *cumulative storage* quota shared across every file uploaded to Gemini's File API under one key, not a per-request rate limit - every upload (segment selection, the video chat, the full-recap button) stayed there taking up quota until Google's automatic ~48 hour expiry, since the app never explicitly deleted anything. Repeated testing/usage inside that 48-hour window silently filled up the quota until every further upload started failing.
- Added `deleteGeminiFile()` to `src/lib/gemini.ts` (best-effort `DELETE /v1beta/{name}`, verified the endpoint path directly against the real API) and a `name` field to `GeminiFileRef` so uploads can actually be cleaned up afterward.
- Wired cleanup into both places that own an uploaded video's lifetime: `HomePage.tsx` deletes the previous recap's Gemini file whenever a new one replaces it (or the component unmounts), including on the failure path where cutting fails *after* the video was already uploaded; `FullVideoSummary.tsx` does the same for its own upload, and now sets its file reference as soon as the upload succeeds (not after the recap text also finishes) so a failed recap-writing step still gets cleaned up.

## Retry on Gemini's transient "Internal error encountered."

- A user hit `Internal error encountered.` (Gemini's own literal error text, passed straight through by the app) when clicking "Get full recap." This is a known transient server-side error Google's API occasionally returns on large multimodal requests like a full video attachment - a 500, not a 4xx - and simply retrying usually succeeds.
- Added `fetchGeminiWithRetry()` to `src/lib/gemini.ts`: retries up to 3 times with exponential backoff specifically on 500/503 responses, returning any other status (4xx, blocked content, quota errors, ...) immediately on the first try since those aren't going to succeed by retrying. Verified the retry/no-retry/give-up-after-max-attempts behavior directly with a standalone test against a mocked fetch.
- Applied to all three places that send the video as a `file_data` attachment and hit this same failure surface: `getFullVideoRecap` (the full-recap button), `analyzeVideoSegmentsWithGemini` (smart segment selection), and `askGeminiAboutVideo` (the video chat). Also switched all three to `describeFailedResponse()` for their non-retryable failure messages, so those now include the actual HTTP status and Gemini's error body instead of just `error.message` with no status context.

## Found the real cause of the persistent "Internal error encountered.": MKV isn't supported at all

- The retry logic above didn't help a user whose "Get full recap" kept failing identically on every attempt - because the cause wasn't transient. Confirmed against Google's own Gemini API docs: MKV (`video/x-matroska`) is not one of Gemini's supported video formats for its video-understanding features at all (the supported set is mp4, mpeg, quicktime/mov, avi, x-flv, mpg, webm, wmv, 3gpp). The File API upload itself still succeeds - storage doesn't validate the container - but every `generateContent` call against an MKV file then fails server-side with the same generic 500, consistently, no matter how many times it's retried.
- Also found and fixed a second real bug while checking this: `guessVideoMimeType()` was mapping `.mov` files to `video/mov`, which isn't a real Gemini MIME type either - the correct one is `video/quicktime`.
- Added `isGeminiSupportedVideoFormat()` to `src/lib/gemini.ts` and used it to gate every Gemini video feature *before* attempting an upload that's guaranteed to fail: `HomePage.tsx`'s smart segment selection now skips straight to periodic sampling for MKV files (same as it already did for over-2GB files), and `FullVideoSummary.tsx` shows an immediate, specific error ("MKV files aren't supported... try converting it to MP4 first") instead of spending a real upload + 3 retries just to fail identically each time. Verified live: selecting an MKV file and clicking "Get full recap" now shows the error instantly with zero Gemini upload requests attempted.
- MKV videos still work completely normally for the actual video cutting (FFmpeg.wasm doesn't care about the container format) - only the Gemini-side features (smart selection, full recap, chat) are unavailable for that one format.

## Let Gemini's smart selection follow the user's own cut settings, above a safe floor

- Per explicit request: Gemini's smart segment selection previously always forced every clip down to exactly `RecapSettings.captureSeconds` (1 second) regardless of what the user had actually configured for "cut every N seconds." Now the user's own chosen interval/capture values are honored *only when they're at least as sparse as the safe default* (cutting no more often than every 8 seconds, capturing at most 1 second each time) - a denser choice than that is silently overridden back to the safe default instead, since accepting extra copyright risk isn't worth it just to honor a denser preference.
- Added `getEffectiveCutPattern()` in `HomePage.tsx`: returns the user's `intervalSeconds`/`captureSeconds` as-is when `intervalSeconds >= 8`, otherwise the safe `8`/`1` floor.
- `analyzeVideoSegmentsWithGemini()` now also enforces **minimum spacing** between consecutive picked clips (not just each clip's own length) - a filtering pass that drops any Gemini-picked segment starting too soon after the previous kept one, using the same effective interval value. This was a real gap before: only clip *length* was ever capped, nothing constrained how close together clips could be.
- Verified both pieces directly with standalone tests: the 8-second threshold behaves correctly at, above, and below the boundary, and the spacing filter correctly keeps/drops segments based on a set of synthetic timestamps.

## Full-recap length now scales with the actual video runtime

- Per explicit request: the "get a full recap" text (`getFullVideoRecap()` in `src/lib/gemini.ts`) previously just told Gemini "several paragraphs is fine if the video warrants it," with no real signal for how much video that actually was. Now the source video's own duration (already read by `VideoUploader` via the browser's `<video>` metadata, passed through as `selectedFile.duration`) is passed into the prompt, which explicitly asks Gemini to scale the recap's length and level of detail to that runtime — roughly one paragraph per 5-10 minutes, with more detail for pivotal or complex stretches — so a feature-length movie gets a longer, more detailed recap than a 20-minute episode instead of both getting a similarly-sized summary.
- Falls back to a generic "scale to how much actually happens" instruction when duration is unavailable, rather than omitting length guidance entirely.
- Verified with a standalone script covering a 42-minute episode, a 2-hour movie, a 1-minute edge case (singular "minute", no trailing "s"), and the undefined-duration fallback.

## Recap length always matches an uploaded MP3 narration exactly

- Per explicit request: when the user uploads their own MP3 narration (`AudioUploader`), the recap's actual length now always matches that audio file's real duration exactly, instead of the separately-configured "recap length" setting. Previously a mismatch between the two would either cut the narration off mid-sentence (audio longer than the setting) or leave the video running on in silence after the narration ended (audio shorter than the setting).
- `AudioUploader` now reads the MP3's duration from the browser's own `<audio>` metadata, the same way `VideoUploader` already reads video duration, and stores it on the new `AudioFile.duration` field.
- `HomePage.handleCreateRecap` computes `effectiveDuration = audioFile?.duration ?? settings.duration` and uses it everywhere the recap length actually matters: the target duration given to Gemini's smart segment selection, FFmpeg's `-t` output cap, and the saved `RecapOutput.durationSeconds`.
- `RecapSettings` now shows the MP3's duration as a locked, read-only value (instead of the editable hours/minutes/seconds inputs) whenever an audio file is present, and its cut-interval auto-sync and settings summary both use that same effective duration so the displayed segment count/interval stay accurate.
- No effect when no MP3 is uploaded - the manual duration setting works exactly as before.

## Fixed the MP3 narration actually getting cut off mid-sentence

- Bug in the previous entry's own fix: FFmpeg's `-shortest` flag was still applied whenever an MP3 narration was muxed in, so the moment the *video* stream ran out - which happens well before the narration's full length whenever the safe copyright cap on clip length/spacing (8 seconds apart, 1 second each) limits how much footage is even available to select - the whole output stopped right there, truncating the audio mid-sentence even though `-t` was already set to the narration's own exact duration.
- Removed `-shortest`. `-t` alone now governs the output length (equal to the narration's real duration when one is provided), so the audio always plays to its natural end; the video stream simply stops appending frames if it runs out first, which most players handle by holding the last frame rather than cutting playback short.
- Also fixed `formatDuration()` in `RecapSettings.tsx`, used to display the locked duration when an MP3 is present: it didn't round its input before formatting the seconds portion, so a real (fractional) MP3 duration like `245.837` rendered as a garbled `"4:5.837"` instead of `"4:06"`.

## Capped the full-recap text's length - it was coming out longer than needed

- Per explicit feedback: the recap-length scaling added two entries above used an open-ended "one paragraph per 5-10 minutes of runtime" ratio, which kept growing without limit for longer movies and ended up producing more text than users actually wanted.
- Replaced it with a capped target paragraph count in `getFullVideoRecap()` (`src/lib/gemini.ts`): `Math.min(7, Math.max(3, Math.round(durationMinutes / 15)))` - so runtime still nudges the length (a 90-minute movie gets more paragraphs than a 20-minute episode), but every recap stays between 3 and 7 short paragraphs, never growing indefinitely for very long movies.
- Also reworded the prompt itself from "a full, detailed recap of everything that happens... be specific... not generic" to explicitly ask for a concise recap that hits only the key plot points instead of exhaustive detail.
- Verified the new paragraph-count formula with a standalone script across a range of runtimes (1 min, 20 min, 45 min, 90 min, 2h, 3h, 5h) - confirmed it stays within the 3-7 bound in every case.

## Switched the full-recap paragraph target to three fixed tiers

- Per explicit request, refined further from the previous entry's continuous `round(durationMinutes / 15)` formula (capped 3-7) to three fixed tiers in `getFullVideoRecap()`: a short episode (up to 30 minutes) gets 4 paragraphs, a longer episode (30-59 minutes, e.g. a ~40-minute drama) gets 8, and anything an hour or longer (a movie) gets 12 - regardless of how much longer than an hour it actually is, so a 3-hour movie still gets the same 12 paragraphs as a 90-minute one.
- Verified the tier boundaries directly: 1/15/22/30 minutes all map to 4, 31/40/45/59 minutes all map to 8, and 60/61/90/120/180 minutes all map to 12.

## Added a 4th tier: movies of 2 hours or more now get 16 paragraphs

- Per explicit request: extended the previous entry's three fixed tiers to four in `getFullVideoRecap()` - short episode (≤30min) → 4, longer episode (30-59min) → 8, movie under 2 hours (60-119min) → 12, and movie of 2 hours or more (120min+) → 16.
- Verified the new boundary directly: 119 minutes still maps to 12, 120 and above all map to 16.

## Shortened the shortest-episode tier from 4 paragraphs to 2

- Per explicit request: the "5-30 minute" tier in `getFullVideoRecap()`'s paragraph-count tiers now targets 2 paragraphs instead of 4. The other three tiers (30-59min → 8, 60-119min → 12, 120min+ → 16) are unchanged.
- Verified: 1/5/20/30 minutes all map to 2, and the 31-minute boundary still correctly maps to 8.

## Reverted the shortest-episode tier back to 4 paragraphs

- Per explicit request, undoing the previous entry: the 5-30 minute tier in `getFullVideoRecap()` is back to targeting 4 paragraphs (not 2). The other three tiers (30-59min → 8, 60-119min → 12, 120min+ → 16) are unchanged.

## Option to keep the movie/show's own original sound in the recap

- Per explicit request: previously a recap was either silent (no audio at all, `-an`) or used a custom MP3 narration the user uploaded - there was no way to keep the source video's own original sound (dialogue, music, effects). Added a checkbox in `AudioUploader` ("Keep the movie/show's own original sound in the recap") that, when checked and no custom MP3 is uploaded, mixes the *original* video's own audio track into the output instead of leaving it silent.
- The original audio is cut with the exact same timing predicate as the video - the same Gemini-picked segments or periodic `every N seconds` pattern - via a mirrored FFmpeg `aselect`/`asetpts` audio filter (`HomePage.tsx`), so dialogue/sound stays in sync with whatever clips actually end up in the recap. Refactored the existing video `select` filter construction to share this predicate (`selectPredicate`) instead of building the video-only filter string directly.
- The three audio modes are mutually exclusive with a clear priority: a custom MP3 narration (if uploaded) always wins; otherwise the checkbox's original-audio mode applies; otherwise the recap stays silent, exactly as before this option existed. The checkbox is disabled in the UI whenever an MP3 is selected, since it wouldn't apply anyway.
- No new saved-audio file is needed for this mode in `RecapSaver` - unlike a custom MP3 narration, the original audio is already embedded directly in the saved video itself.
- Verified the three FFmpeg argument branches (silent / custom MP3 / keep-original-audio) directly, including that a selected MP3 always takes priority over the checkbox even if both are set.

## Exposed segment length (captureSeconds) as its own setting

- Per explicit request: "how many seconds to cut" only ever let users choose the *interval* (how often a cut happens) - the *length* of each individual cut (`captureSeconds`) had no UI control at all and was hardcoded to 1 second everywhere. Added a "Segment Length (seconds)" field in `RecapSettings` so users can choose a longer capture per cut, not just a longer/shorter gap between cuts.
- Still governed by the existing safe-floor rule (`getEffectiveCutPattern` in `HomePage.tsx`, unchanged): the chosen `captureSeconds` is only actually honored when the cut interval is 8 seconds or more; below that, it's silently overridden back to the safe 1-second default regardless of what's set here, for copyright safety. Added a visible amber warning under the new field whenever the current interval is under 8 seconds, so it's clear when the setting won't take effect.
- Also fixed the interval hint text, which hardcoded "a 1-second segment will be cut" even after `captureSeconds` became configurable - now interpolates the real value. Added the segment length to the settings summary box too.

## Let Gemini's smart selection jump back and forth in time, not just forward

- Per explicit request: the segment-selection prompt (`analyzeVideoSegmentsWithGemini` in `HomePage.tsx`) previously told Gemini to list its picked segments "in chronological order," which could bias it toward only scanning forward through the video and never reconsidering an earlier moment once it had moved past it while composing its answer.
- Replaced that instruction with the opposite: Gemini is now explicitly told it does NOT need to scan forward or list segments in order - it can freely go back to an earlier part of the video after already picking something later on, and just return whichever moments are most important regardless of where they fall.
- This was already safe to allow: the client-side processing sorts every returned segment by start time before applying the length cap and minimum-spacing filter, so the final cut is always chronological and correctly spaced no matter what order Gemini's reply lists things in. Reworded the "consecutive segments" spacing rule to "any two segments," since segment order in Gemini's own reply is no longer meaningful.
- Verified directly with a standalone script using deliberately out-of-order/backtracking timestamps as input - confirmed the output still comes back sorted, properly spaced (every gap ≥ the minimum), and each clip capped to the max length.

## Fixed a real AdSense policy violation: unmatched URLs served a blank screen

- Per a Google AdSense policy notice ("Google-served ads on screens without publisher content" / low-value content): found and fixed a genuine bug behind it - `App.tsx`'s `<Routes>` had no catch-all route, so ANY URL that didn't exactly match one of the six real paths (a typo, an old/dead link, a bot probing random paths) rendered the app shell (`Header` + `Footer`) with a completely **empty** `<main>` - literally a screen with no content at all - while `public/_redirects`' single blanket `/* /index.html 200` rule meant it was still served with a success HTTP status, making it fully crawlable. With the AdSense loader script present site-wide, this is exactly the kind of page the policy prohibits serving ads on.
- Added `NotFoundPage.tsx` (a real page - heading, explanation, and links back to Home/History/FAQ/Contact) and wired it as a catch-all `<Route path="*">` in `App.tsx`, so unmatched URLs now render actual content instead of a blank screen.
- Rewrote `public/_redirects` to list the six real routes explicitly with status 200, falling back to `/* /index.html 404` for everything else - `index.html` (and therefore the SPA, including the new `NotFoundPage`) is still served either way, but genuinely unknown paths now correctly report HTTP 404 to crawlers instead of 200, rather than silently indexing a no-content page as if it were real. Applies to both Cloudflare Pages and Netlify, which both honor this same `_redirects` file format.
- Verified: `npm run build` copies the updated `_redirects` into `dist/` correctly, the dev server's SPA fallback still serves the app shell for an unmatched path, and the built JS bundle includes the new `NotFoundPage` translations.
- This doesn't guarantee it was the exact page Google's review flagged (no specific example URL was available to confirm against) - if the policy center still shows a violation after requesting a re-review, check the specific URL(s) listed there for anything else.

## Added two more paragraph-count tiers for longer movies

- Per explicit request: split the previous "2 hours or more → 16 paragraphs" tier in `getFullVideoRecap()` into three - a movie under 1.5 hours (60-89min) keeps 12, a movie of 1.5 hours or more but under 2 hours (90-119min) now gets 16, and a movie of 2 hours or more (120min+) gets 22. The 5-30min (4) and 30-59min (8) tiers are unchanged.
- Verified the new boundaries directly: 89 minutes still maps to 12, 90-119 minutes all map to 16, and 120+ minutes all map to 22.

## Added a 20-29 minute tier for the full-recap paragraph count

- Per explicit request: split the previous "under 30 minutes → 4 paragraphs" tier in `getFullVideoRecap()` so 20-29 minute videos now get 6 paragraphs instead of 4. Under 20 minutes stays at 4, and exactly 30 minutes stays at 4 too (unchanged from before) - only the 20-29 range moved. All other tiers (30-59min → 8, 60-89min → 12, 90-119min → 16, 120min+ → 22) are unchanged.
- Verified directly: 1-19 minutes all map to 4, 20-29 minutes all map to 6, and 30 minutes still maps to 4.

## Extended the 6-paragraph tier to include exactly 30 minutes

- Per explicit request, undoing the previous entry's "30 minutes stays at 4" quirk: `getFullVideoRecap()`'s tier boundary is now 20-30 minutes (inclusive) → 6 paragraphs, so a video of exactly 30 minutes gets 6 instead of dropping back to 4. 31-59 minutes still gets 8, unchanged.
- Verified directly: 19 minutes still maps to 4, 20 through 30 minutes all map to 6, and 31 minutes still maps to 8.

## Known limitations / things not done

- Multi-threaded FFmpeg (would meaningfully speed up long/large video processing) is implemented in git history but currently reverted — enabling it requires accepting the COOP/COEP cross-origin risk described above.
- Only 6 languages are translated so far; adding more is straightforward (copy an existing locale file, translate it, register it in `src/i18n/config.ts`) but each additional language was not done proactively.
- The old `.env.local` values remain visible in earlier git history even though the file is no longer tracked going forward.
