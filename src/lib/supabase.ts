import { createClient, type User } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
  console.error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Set them in .env.local (see .env.example) ' +
    'or your host\'s environment variables - see README.md for full Supabase setup instructions. ' +
    'The site will still work for creating recaps, but saving/history/auth are disabled until this is set.'
  )
}

// createClient() throws synchronously on an empty/invalid URL, which would
// otherwise take down the entire app before it even renders - fall back to a
// syntactically valid placeholder so unset config degrades to "save/sign-in
// don't work" instead of a blank page. Every call site here already handles
// the resulting network errors gracefully.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
)

export type { User as SupabaseUser }

// Signing in is optional everywhere in this app - but every visitor still
// needs *some* stable identity to save recaps/ratings under. Supabase's
// anonymous sign-in gives every visitor a real, backend-recognized user (a
// real auth.uid() Row Level Security policies can check), not just a
// client-generated ID. If someone later creates a real account (see
// AuthPanel), Supabase upgrades this same session in place - their
// anonymous history carries over automatically instead of being orphaned.
export async function ensureSession(): Promise<User | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) return session.user

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) {
    console.error('Anonymous sign-in failed:', error.message)
    return null
  }
  return data.user
}

export async function getCurrentUser(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/** True for a real (non-anonymous) signed-in account - i.e. one with an email. */
export function isPermanentUser(user: User | null): boolean {
  return !!user && !user.is_anonymous
}

const RECAPS_BUCKET = 'recaps'

/** Uploads a file to the public "recaps" storage bucket and returns its public URL. */
export async function uploadRecapFile(file: Blob | File, path: string): Promise<string> {
  const { error } = await supabase.storage.from(RECAPS_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (error) {
    throw error
  }
  const { data } = supabase.storage.from(RECAPS_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export interface RecapRecord {
  id: string
  userId: string
  title: string
  genre?: string
  description?: string
  scriptText: string
  videoUrl?: string
  audioUrl?: string
  duration: number
  cutInterval: number
  createdAt: string
  // Optional feedback set from History - "up"-rated recaps are fed back into
  // future script-generation prompts as few-shot examples (see
  // recapStorageService.getGoodExamples), so the app improves from actual
  // usage over time without needing to retrain the underlying model.
  rating?: 'up' | 'down'
}

// Tracks a Gemini fine-tuning job for a given user/API key, so the app can
// check back on long-running training across sessions instead of blocking
// on it. See src/lib/geminiTuning.ts.
export interface TuningJobRecord {
  id: string
  userId: string
  operationName: string // e.g. "tunedModels/xxx/operations/yyy", used to poll status
  baseModel: string
  exampleCount: number
  status: 'training' | 'ready' | 'failed'
  tunedModelName?: string // e.g. "tunedModels/xxx", set once status is "ready"
  errorMessage?: string
  createdAt: string
}

// Row shapes as they actually exist in Postgres (snake_case) - converted
// to/from the camelCase RecapRecord/TuningJobRecord shapes above at the
// edges (recapStorage.ts / geminiTuning.ts) so the rest of the app never has
// to think about the naming difference.
export interface RecapRow {
  id: string
  user_id: string
  title: string
  genre: string | null
  description: string | null
  script_text: string
  video_url: string | null
  audio_url: string | null
  duration: number
  cut_interval: number
  rating: 'up' | 'down' | null
  created_at: string
}

export interface TuningJobRow {
  id: string
  user_id: string
  operation_name: string
  base_model: string
  example_count: number
  status: 'training' | 'ready' | 'failed'
  tuned_model_name: string | null
  error_message: string | null
  created_at: string
}

export function recapRowToRecord(row: RecapRow): RecapRecord {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    genre: row.genre || undefined,
    description: row.description || undefined,
    scriptText: row.script_text,
    videoUrl: row.video_url || undefined,
    audioUrl: row.audio_url || undefined,
    duration: row.duration,
    cutInterval: row.cut_interval,
    rating: row.rating || undefined,
    createdAt: row.created_at,
  }
}

export function tuningJobRowToRecord(row: TuningJobRow): TuningJobRecord {
  return {
    id: row.id,
    userId: row.user_id,
    operationName: row.operation_name,
    baseModel: row.base_model,
    exampleCount: row.example_count,
    status: row.status,
    tunedModelName: row.tuned_model_name || undefined,
    errorMessage: row.error_message || undefined,
    createdAt: row.created_at,
  }
}
