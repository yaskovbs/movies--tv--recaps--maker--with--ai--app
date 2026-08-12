// Global, shared app usage stats (recaps created, unique visitors, ratings) -
// backed by Supabase (see supabase/migrations/20260812130000_app_stats.sql)
// instead of per-browser localStorage, so every visitor sees the same real
// counts rather than numbers that reset on every new device/browser.
import { supabase, isSupabaseConfigured } from './supabase'

export interface AppStats {
  recaps_created: number
  total_rating_sum: number
  rating_count: number
  active_users: number
}

const VISITOR_ID_KEY = 'visitor_id'
const HAS_RATED_KEY = 'hasRated'

// The visitor UUID itself is only ever used locally, to know whether *this*
// browser has already registered/rated - the actual counts live in Supabase.
function getVisitorId(): string {
  let id = localStorage.getItem(VISITOR_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(VISITOR_ID_KEY, id)
  }
  return id
}

export function hasRated(): boolean {
  return localStorage.getItem(HAS_RATED_KEY) === 'true'
}

export async function registerVisitor(): Promise<void> {
  if (!isSupabaseConfigured) return
  const { error } = await supabase.rpc('register_visitor', { p_visitor_id: getVisitorId() })
  if (error) console.error('Failed to register visitor:', error)
}

export async function getPublicStats(): Promise<AppStats | null> {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase.rpc('get_public_stats')
  if (error) {
    console.error('Failed to fetch stats:', error)
    return null
  }
  const row = Array.isArray(data) ? data[0] : data
  return row ?? null
}

export async function incrementRecapsCreated(): Promise<void> {
  if (!isSupabaseConfigured) return
  const { error } = await supabase.rpc('increment_recaps_created')
  if (error) console.error('Failed to increment recaps created:', error)
}

export async function addRating(rating: number): Promise<void> {
  if (!isSupabaseConfigured || hasRated()) return
  const { error } = await supabase.rpc('add_app_rating', { p_rating: rating })
  if (error) throw error
  localStorage.setItem(HAS_RATED_KEY, 'true')
}
