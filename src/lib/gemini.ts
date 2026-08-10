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
