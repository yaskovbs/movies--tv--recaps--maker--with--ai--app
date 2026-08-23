import type { GeminiFileRef } from '../types'

// Gemini's File API caps individual files at 2GB - beyond that, skip video
// analysis/upload entirely rather than waste time on a request that will
// just fail.
export const GEMINI_VIDEO_SIZE_CAP = 2 * 1024 * 1024 * 1024;

// Turns a failed fetch Response into a readable message with the actual
// status + body instead of a generic "it failed" - upload failures were
// previously reported as one identical message regardless of cause (bad API
// key, key missing File API access, size/quota limits, CORS, ...), which
// made it impossible to tell what was actually wrong from the error alone.
export async function describeFailedResponse(response: Response): Promise<string> {
  const bodyText = await response.text().catch(() => '')
  let detail = bodyText
  try {
    const parsed = JSON.parse(bodyText)
    detail = parsed?.error?.message || bodyText
  } catch {
    // not JSON - use the raw body text as-is
  }
  return `HTTP ${response.status}${detail ? ` - ${detail}` : ''}`
}

// Gemini occasionally returns a transient server-side error - most
// recognizably a 500 with the literal body message "Internal error
// encountered." - on large multimodal requests like a full video file_data
// attachment. This is not the same as a 503 "model overloaded" (which
// generateScriptWithGemini used to retry back when it existed), but the
// same fix applies: retrying with backoff usually succeeds on the next
// attempt. Non-retryable failures (4xx, blocked content, quota, ...) are
// returned immediately on the first try, unmodified, for the caller to
// handle as before.
export async function fetchGeminiWithRetry(
  apiUrl: string,
  body: unknown,
  signal: AbortSignal,
  maxAttempts = 3
): Promise<Response> {
  let lastResponse: Response
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    lastResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (lastResponse.ok || attempt === maxAttempts || (lastResponse.status !== 500 && lastResponse.status !== 503)) {
      return lastResponse
    }
    await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
  }
  return lastResponse!
}

// Uploads a file (audio narration or the source video) to Gemini's File API
// so the model can actually see/hear it, not just read a text description of
// it. Inline base64 media in generateContent is capped around 20MB per
// request, which both a multi-minute narration and any real video file can
// easily exceed, so this uses the resumable upload + file_uri reference flow
// instead, which is what Google's audio/video inputs are designed around.
export async function uploadFileToGemini(
  file: File,
  apiKey: string,
  mimeType: string,
  maxWaitMs = 30_000,
  onWaiting?: (elapsedMs: number) => void
): Promise<GeminiFileRef> {
  const startResponse = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(file.size),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: file.name } }),
    }
  );
  if (!startResponse.ok) {
    throw new Error(`Failed to start the file upload to Gemini: ${await describeFailedResponse(startResponse)}`);
  }
  const uploadUrl = startResponse.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) {
    throw new Error('Gemini did not return an upload URL.');
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(file.size),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: file,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload the file bytes to Gemini: ${await describeFailedResponse(uploadResponse)}`);
  }

  let fileInfo = (await uploadResponse.json()).file as { uri?: string; name?: string; state?: string };
  if (!fileInfo?.uri || !fileInfo?.name) {
    throw new Error('Gemini upload response is missing the file URI.');
  }

  // Audio/video files go through a PROCESSING step before they can be
  // referenced in generateContent - poll until Gemini marks it ACTIVE.
  // Processing time scales with video length, not file size: a real
  // movie/episode routinely takes several minutes even well under the 2GB
  // cap, so this is budgeted by elapsed time rather than a small fixed
  // attempt count (a previous 90-second budget meant real videos almost
  // always timed out here and silently fell back to periodic sampling).
  const pollIntervalMs = 2000;
  const deadline = Date.now() + maxWaitMs;
  while (fileInfo.state === 'PROCESSING' && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    onWaiting?.(Date.now() - (deadline - maxWaitMs));
    const statusResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileInfo.name}?key=${apiKey}`
    );
    if (!statusResponse.ok) break;
    fileInfo = await statusResponse.json();
  }

  if (fileInfo.state !== 'ACTIVE' || !fileInfo.uri || !fileInfo.name) {
    throw new Error('Gemini could not finish processing the file in time.');
  }

  return { uri: fileInfo.uri, mimeType, name: fileInfo.name };
}

// Explicitly deletes a file from Gemini's File API once the app is done with
// it. Every uploaded file counts against a shared, cumulative per-key
// storage quota (currently 20GB) until it's deleted or auto-expires after
// ~48 hours - without this, repeated testing/usage in the same window
// silently fills up that quota and every further upload starts failing with
// HTTP 429 ("Quota exceeded for metric: file_storage_bytes"). Best-effort:
// never throws, since failing to clean up shouldn't break whatever the user
// was actually doing.
export async function deleteGeminiFile(name: string, apiKey: string): Promise<void> {
  try {
    await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}?key=${apiKey}`, {
      method: 'DELETE',
    })
  } catch (e) {
    console.warn('Failed to delete Gemini file (non-fatal):', name, e)
  }
}

// Gemini's video understanding only decodes a specific set of container/codec
// combinations (video/mp4, video/mpeg, video/quicktime, video/avi,
// video/x-flv, video/mpg, video/webm, video/wmv, video/3gpp - confirmed
// against Google's own docs). Notably, MKV (Matroska) is NOT in that list:
// the File API upload itself still succeeds (storage doesn't validate the
// container), but every generateContent call against it then fails
// server-side with a generic "Internal error encountered." (HTTP 500) -
// consistently, not as an occasional transient blip, so retrying doesn't
// help. video/mov (this app's old mapping) isn't correct either - Google's
// own MIME type for QuickTime .mov files is video/quicktime.
export function guessVideoMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mov': return 'video/quicktime';
    case 'avi': return 'video/avi';
    default: return 'video/mp4';
  }
}

// Whether Gemini can actually watch a video with this file extension at all
// (as opposed to just accepting the upload bytes) - used to skip attempting
// the upload entirely for formats known not to work, rather than wasting
// time on a request that will fail every time regardless of retries.
export function isGeminiSupportedVideoFormat(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext !== 'mkv';
}

// Movies/TV shows legitimately involve violence, crime, horror and other
// dark themes as part of the genre itself - Gemini's default safety
// thresholds (BLOCK_MEDIUM_AND_ABOVE) routinely false-positive on ordinary
// plot descriptions and video content that's just describing/showing an
// existing, already-published work, not generating original harmful
// content. Loosened to BLOCK_ONLY_HIGH (still blocks clearly extreme
// content) across every Gemini call in this app to cut down on SAFETY
// blocks on completely ordinary recap requests. Note: this does NOT affect
// PROHIBITED_CONTENT blocks - that's a separate, non-adjustable built-in
// protection (Google's own core-harm filter, e.g. child safety) with no API
// setting able to override it.
export const GEMINI_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
]

// Builds a user-facing message for a Gemini promptFeedback.blockReason.
// PROHIBITED_CONTENT gets distinct guidance since - unlike SAFETY - no
// safetySettings adjustment can affect it; the only fix is changing what was
// actually submitted (title/description text, or the video itself).
export function describeGeminiBlockReason(blockReason: string | undefined): string {
  if (blockReason === 'PROHIBITED_CONTENT') {
    return 'Gemini blocked this content for policy reasons that cannot be adjusted via settings (reason: PROHIBITED_CONTENT). Try rephrasing the title/description to remove extreme, graphic, or otherwise sensitive details.';
  }
  if (blockReason) {
    return `Gemini blocked the response (reason: ${blockReason}). Try adjusting the description.`;
  }
  return 'Gemini returned no video analysis.';
}

// Asks Gemini to write a concise text recap of what happens in an
// already-uploaded video, start to finish - used by the "get a full recap"
// button offered right after uploading a video, before the user commits to
// cutting/creating anything. Separate from both segment selection
// (analyzeVideoSegmentsWithGemini in HomePage.tsx, which picks moments to
// cut) and the open-ended video chat (VideoChat.tsx) - this is a single,
// complete summary in one shot.
export async function getFullVideoRecap(
  fileRef: GeminiFileRef,
  apiKey: string,
  description: string,
  // The source video/episode's own actual runtime - used to pick a target
  // paragraph count from three fixed tiers (see targetParagraphs below)
  // instead of leaving Gemini to guess a length, or scaling continuously
  // and unboundedly with runtime.
  videoDurationSeconds: number | undefined,
  maxWaitMs = 5 * 60 * 1000
): Promise<string> {
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${apiKey}`;

  const durationMinutes = videoDurationSeconds ? Math.round(videoDurationSeconds / 60) : undefined;
  // Per explicit request: three fixed tiers instead of a continuous formula -
  // a short series episode (up to 30 min) gets 4 paragraphs, a longer episode
  // (30-59 min, e.g. a ~40-minute drama) gets 8, and anything an hour or
  // longer (a movie) gets 12 - regardless of how much longer than an hour it
  // actually is, so a 3-hour movie still gets the same concise 12 paragraphs
  // as a 90-minute one.
  const targetParagraphs = durationMinutes === undefined
    ? undefined
    : durationMinutes <= 30
    ? 4
    : durationMinutes < 60
    ? 8
    : 12;
  const lengthGuidance = targetParagraphs
    ? `The video is about ${durationMinutes} minute${durationMinutes === 1 ? '' : 's'} long. Write a concise recap of about ${targetParagraphs} short paragraphs total - cover only the key plot events, not every detail. Do not write more than that just because the video is long; stay concise and hit the highlights.`
    : `Write a concise recap - a handful of short paragraphs covering only the key plot events, not every detail.`;

  const prompt = `
    You are given a movie/TV episode video file. Watch the entire video carefully, start to finish.
    ${description ? `\n    Context provided by the user:\n    """\n    ${description}\n    """\n` : ''}
    ${lengthGuidance}
    Cover the setup, the key plot events in order, the main characters involved, and how it ends - but keep it tight and to the point rather than exhaustive. Be specific about what actually happens, not generic, while staying concise.

    Return only the recap text, no additional commentary or headings.
  `;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), maxWaitMs);

  let response: Response;
  try {
    response = await fetchGeminiWithRetry(API_URL, {
      contents: [{
        parts: [
          { file_data: { mime_type: fileRef.mimeType, file_uri: fileRef.uri } },
          { text: prompt },
        ],
      }],
      safetySettings: GEMINI_SAFETY_SETTINGS,
    }, controller.signal);
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error('Gemini took too long to write the recap.');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Gemini full-recap request failed: ${await describeFailedResponse(response)}`);
  }

  const data = await response.json();
  const text: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(describeGeminiBlockReason(data.promptFeedback?.blockReason));
  }
  return text.trim();
}

// Lightweight Gemini API key validation - lists models instead of generating
// anything, so checking a key doesn't burn generation quota/tokens. Used by
// Header's automatic "is this key valid" indicator.
export interface ApiKeyCheckResult {
  valid: boolean
  error?: string
}

export async function validateGeminiApiKey(apiKey: string): Promise<ApiKeyCheckResult> {
  if (!apiKey.trim()) {
    return { valid: false, error: 'No API key provided.' }
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
    if (response.ok) {
      return { valid: true }
    }
    const data = await response.json().catch(() => null)
    return { valid: false, error: data?.error?.message || `HTTP ${response.status}` }
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Network error' }
  }
}
