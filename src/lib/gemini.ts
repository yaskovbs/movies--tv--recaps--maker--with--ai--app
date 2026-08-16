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
