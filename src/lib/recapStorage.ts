import { blink, RecapRecord } from './blink'

const recapsTable = blink.db.table<RecapRecord>('recaps')

export class RecapStorageService {
  /**
   * Save a recap to the database
   */
  async saveRecap(recap: Omit<RecapRecord, 'id' | 'createdAt'>): Promise<RecapRecord> {
    try {
      const user = await blink.auth.me()
      if (!user?.id) {
        throw new Error('User not authenticated')
      }

      const recapData = {
        userId: user.id,
        title: recap.title,
        genre: recap.genre || '',
        description: recap.description || '',
        scriptText: recap.scriptText,
        videoUrl: recap.videoUrl || '',
        audioUrl: recap.audioUrl || '',
        duration: recap.duration || 0,
        cutInterval: recap.cutInterval || 0,
        createdAt: new Date().toISOString()
      }

      const savedRecap = await recapsTable.create(recapData)
      return savedRecap as RecapRecord
    } catch (error) {
      console.error('Failed to save recap:', error)
      throw error
    }
  }

  /**
   * Fetch all recaps for current user
   */
  async getRecaps(): Promise<RecapRecord[]> {
    try {
      const user = await blink.auth.me()
      if (!user?.id) {
        throw new Error('User not authenticated')
      }

      const recaps = await recapsTable.list({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' }
      })

      return recaps as RecapRecord[]
    } catch (error) {
      console.error('Failed to fetch recaps:', error)
      throw error
    }
  }

  /**
   * Delete a recap from the database
   */
  async deleteRecap(recapId: string): Promise<void> {
    try {
      await recapsTable.delete(recapId)
    } catch (error) {
      console.error('Failed to delete recap:', error)
      throw error
    }
  }

  /**
   * Rate a saved recap "up" or "down". "up"-rated recaps become candidates
   * for getGoodExamples() below.
   */
  async rateRecap(recapId: string, rating: 'up' | 'down'): Promise<void> {
    try {
      await recapsTable.update(recapId, { rating })
    } catch (error) {
      console.error('Failed to rate recap:', error)
      throw error
    }
  }

  /**
   * Fetches this user's own "up"-rated past recaps to use as few-shot
   * examples when generating a new script - a lightweight way for the app to
   * improve from actual usage over time without retraining Gemini itself.
   * Prefers recaps matching the given genre. Non-fatal: returns an empty
   * array (instead of throwing) if the user isn't authenticated yet or has
   * no rated recaps - this is a nice-to-have, not a requirement.
   */
  async getGoodExamples(genre: string, limit = 3): Promise<RecapRecord[]> {
    try {
      const user = await blink.auth.me()
      if (!user?.id) return []

      const recaps = await recapsTable.list({
        where: { userId: user.id, rating: 'up' },
        orderBy: { createdAt: 'desc' },
        limit: 20,
      }) as RecapRecord[]

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
