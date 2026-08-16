import type { GeminiFileRef } from '../types'

// Gemini's File API caps individual files at 2GB - beyond that, skip video
// analysis/upload entirely rather than waste time on a request that will
// just fail.
export const GEMINI_VIDEO_SIZE_CAP = 2 * 1024 * 1024 * 1024;

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
    throw new Error('Failed to start the file upload to Gemini.');
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
    throw new Error('Failed to upload the file bytes to Gemini.');
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

  if (fileInfo.state !== 'ACTIVE' || !fileInfo.uri) {
    throw new Error('Gemini could not finish processing the file in time.');
  }

  return { uri: fileInfo.uri, mimeType };
}

export function guessVideoMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mov': return 'video/mov';
    case 'avi': return 'video/avi';
    case 'mkv': return 'video/x-matroska';
    default: return 'video/mp4';
  }
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

// Asks Gemini to write a full, detailed text recap of everything that
// happens in an already-uploaded video, start to finish - used by the "get a
// full recap" button offered right after uploading a video, before the user
// commits to cutting/creating anything. Separate from both segment selection
// (analyzeVideoSegmentsWithGemini in HomePage.tsx, which picks moments to
// cut) and the open-ended video chat (VideoChat.tsx) - this is a single,
// complete summary in one shot.
export async function getFullVideoRecap(
  fileRef: GeminiFileRef,
  apiKey: string,
  description: string,
  maxWaitMs = 5 * 60 * 1000
): Promise<string> {
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${apiKey}`;

  const prompt = `
    You are given a movie/TV episode video file. Watch the entire video carefully, start to finish.
    ${description ? `\n    Context provided by the user:\n    """\n    ${description}\n    """\n` : ''}
    Write a full, detailed recap of everything that happens in the video - the setup, the key plot events in order, the characters involved, and how it ends. Be specific about what you actually see and hear, not generic. Several paragraphs is fine if the video warrants it.

    Return only the recap text, no additional commentary or headings.
  `;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), maxWaitMs);

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { file_data: { mime_type: fileRef.mimeType, file_uri: fileRef.uri } },
            { text: prompt },
          ],
        }],
        safetySettings: GEMINI_SAFETY_SETTINGS,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error('Gemini took too long to write the recap.');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error?.message || 'Gemini full-recap request failed.');
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
