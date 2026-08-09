import { supabase, ensureSession, RecapRecord, RecapRow, recapRowToRecord } from './supabase'

export class RecapStorageService {
  /**
   * Save a recap to the database. Signing in is optional - ensureSession()
   * transparently gets (or creates) a real, if anonymous, Supabase user so
   * this always has somewhere to save to.
   */
  async saveRecap(recap: Omit<RecapRecord, 'id' | 'createdAt' | 'userId'>): Promise<RecapRecord> {
    const user = await ensureSession()
    if (!user) {
      throw new Error('Could not establish a session to save under. Please try again.')
    }

    const { data, error } = await supabase
      .from('recaps')
      .insert({
        user_id: user.id,
        title: recap.title,
        genre: recap.genre || null,
        description: recap.description || null,
        script_text: recap.scriptText,
        video_url: recap.videoUrl || null,
        audio_url: recap.audioUrl || null,
        duration: recap.duration || 0,
        cut_interval: recap.cutInterval || 0,
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to save recap:', error)
      throw new Error(error.message)
    }

    return recapRowToRecord(data as RecapRow)
  }

  /**
   * Fetch all recaps for the current user (signed-in, or this session's
   * anonymous identity).
   */
  async getRecaps(): Promise<RecapRecord[]> {
    const user = await ensureSession()
    if (!user) return []

    const { data, error } = await supabase
      .from('recaps')
      .select()
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch recaps:', error)
      throw new Error(error.message)
    }

    return (data as RecapRow[]).map(recapRowToRecord)
  }

  /**
   * Delete a recap from the database.
   */
  async deleteRecap(recapId: string): Promise<void> {
    const { error } = await supabase.from('recaps').delete().eq('id', recapId)
    if (error) {
      console.error('Failed to delete recap:', error)
      throw new Error(error.message)
    }
  }

  /**
   * Rate a saved recap "up" or "down". "up"-rated recaps become candidates
   * for getGoodExamples() below.
   */
  async rateRecap(recapId: string, rating: 'up' | 'down'): Promise<void> {
    const { error } = await supabase.from('recaps').update({ rating }).eq('id', recapId)
    if (error) {
      console.error('Failed to rate recap:', error)
      throw new Error(error.message)
    }
  }

  /**
   * Fetches this user's own "up"-rated past recaps to use as few-shot
   * examples when generating a new script - a lightweight way for the app to
   * improve from actual usage over time without retraining Gemini itself.
   * Prefers recaps matching the given genre. Non-fatal: returns an empty
   * array (instead of throwing) if there are no rated recaps yet - this is a
   * nice-to-have, not a requirement.
   */
  async getGoodExamples(genre: string, limit = 3): Promise<RecapRecord[]> {
    try {
      const user = await ensureSession()
      if (!user) return []

      const { data, error } = await supabase
        .from('recaps')
        .select()
        .eq('user_id', user.id)
        .eq('rating', 'up')
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error

      const recaps = (data as RecapRow[]).map(recapRowToRecord)
      const sameGenre = genre ? recaps.filter(r => r.genre === genre) : []
      const rest = recaps.filter(r => !sameGenre.includes(r))
      return [...sameGenre, ...rest].slice(0, limit)
    } catch (error) {
      console.warn('Could not load past examples for few-shot prompting:', error)
      return []
    }
  }
}

export const recapStorageService = new RecapStorageService()
