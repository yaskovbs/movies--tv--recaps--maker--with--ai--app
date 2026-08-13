// Local, browser-only fallback for "learn from usage over time" (see
// recapStorageService.getGoodExamples for the Supabase-backed version).
// Recording an example here happens automatically right after every script
// is generated - it does not depend on the user ever opening Save Recap or
// signing in, so few-shot learning keeps working even while recap saving
// itself is broken/unconfigured. Lives entirely in this browser's
// localStorage, so it's per-device and won't follow a user across devices
// the way the Supabase-backed examples would once saving works.

export interface LocalScriptExample {
  id: string
  title: string
  genre?: string
  scriptText: string
  rating?: 'up' | 'down'
  createdAt: string
}

const STORAGE_KEY = 'local_script_examples'
const MAX_STORED = 30

function readAll(): LocalScriptExample[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeAll(examples: LocalScriptExample[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(examples.slice(0, MAX_STORED)))
  } catch {
    // Storage full or unavailable (e.g. private browsing) - non-fatal, this
    // feature is a nice-to-have on top of normal recap generation.
  }
}

// Called right after a script is generated. Returns the new example's id so
// the UI can attach an immediate thumbs up/down rating to it.
export function recordLocalExample(entry: { title: string; genre?: string; scriptText: string }): string {
  const id = crypto.randomUUID()
  const examples = readAll()
  examples.unshift({ ...entry, id, createdAt: new Date().toISOString() })
  writeAll(examples)
  return id
}

export function rateLocalExample(id: string, rating: 'up' | 'down'): void {
  const examples = readAll()
  const index = examples.findIndex(e => e.id === id)
  if (index !== -1) {
    examples[index] = { ...examples[index], rating }
    writeAll(examples)
  }
}

export function getRatingForLocalExample(id: string): 'up' | 'down' | undefined {
  return readAll().find(e => e.id === id)?.rating
}

// Mirrors recapStorageService.getGoodExamples - prefers same-genre examples,
// then fills in with the rest of this browser's "up"-rated history.
export function getGoodLocalExamples(genre: string, limit = 3): LocalScriptExample[] {
  const upRated = readAll().filter(e => e.rating === 'up')
  const sameGenre = genre ? upRated.filter(e => e.genre === genre) : []
  const rest = upRated.filter(e => !sameGenre.includes(e))
  return [...sameGenre, ...rest].slice(0, limit)
}
