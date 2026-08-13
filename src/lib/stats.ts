// Global, shared app usage stats (recaps created, unique visitors, ratings) -
// backed by Supabase (see supabase/migrations/20260812130000_app_stats.sql)
// when it's configured and working, with a local, per-device fallback so the
// homepage still shows real (if not globally shared) numbers instead of just
// zeros while Supabase is unconfigured, its migration hasn't been run yet, or
// a request simply fails.
import { supabase, isSupabaseConfigured } from './supabase'

export interface AppStats {
  recaps_created: number
  total_rating_sum: number
  rating_count: number
  active_users: number
}

const VISITOR_ID_KEY = 'visitor_id'
const HAS_RATED_KEY = 'hasRated'
const LOCAL_STATS_KEY = 'local_app_stats_fallback'

// The visitor UUID itself is only ever used locally, to know whether *this*
// browser has already registered/rated - the actual counts live in Supabase
// when that succeeds.
function getVisitorId(): string {
  let id = localStorage.getItem(VISITOR_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(VISITOR_ID_KEY, id)
  }
  return id
}

function readLocalStats(): AppStats {
  try {
    const raw = localStorage.getItem(LOCAL_STATS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // fall through to defaults
  }
  return { recaps_created: 0, total_rating_sum: 0, rating_count: 0, active_users: 1 }
}

function writeLocalStats(stats: AppStats): void {
  try {
    localStorage.setItem(LOCAL_STATS_KEY, JSON.stringify(stats))
  } catch {
    // Storage full or unavailable (e.g. private browsing) - non-fatal.
  }
}

export function hasRated(): boolean {
  return localStorage.getItem(HAS_RATED_KEY) === 'true'
}

export async function registerVisitor(): Promise<void> {
  if (!isSupabaseConfigured) return
  const { error } = await supabase.rpc('register_visitor', { p_visitor_id: getVisitorId() })
  if (error) console.error('Failed to register visitor:', error)
}

// Prefers the real, globally-shared Supabase count. Falls back to this
// device's own local count (never null) whenever Supabase isn't configured,
// its migration/RPC functions haven't been set up yet, or the request fails
// for any other reason - so the homepage always has real numbers to show.
export async function getPublicStats(): Promise<AppStats> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.rpc('get_public_stats')
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data
      if (row) return row
    } else {
      console.warn('Supabase stats unavailable, falling back to local device stats:', error)
    }
  }
  return readLocalStats()
}

export async function incrementRecapsCreated(): Promise<void> {
  // Always keep the local fallback counter current too, so it stays
  // meaningful the moment Supabase becomes unreachable/misconfigured,
  // without needing this specific call to have failed first.
  const local = readLocalStats()
  local.recaps_created += 1
  writeLocalStats(local)

  if (!isSupabaseConfigured) return
  const { error } = await supabase.rpc('increment_recaps_created')
  if (error) console.error('Failed to increment recaps created in Supabase (kept local count):', error)
}

export async function addRating(rating: number): Promise<void> {
  if (hasRated()) return

  const local = readLocalStats()
  local.total_rating_sum += rating
  local.rating_count += 1
  writeLocalStats(local)
  localStorage.setItem(HAS_RATED_KEY, 'true')

  if (!isSupabaseConfigured) return
  const { error } = await supabase.rpc('add_app_rating', { p_rating: rating })
  if (error) console.error('Failed to add rating in Supabase (kept local rating):', error)
}
