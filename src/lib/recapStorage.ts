import { blink, RecapRecord } from './blink'

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

      const savedRecap = await blink.db.recaps.create(recapData)
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

      const recaps = await blink.db.recaps.list({
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
      await blink.db.recaps.delete(recapId)
    } catch (error) {
      console.error('Failed to delete recap:', error)
      throw error
    }
  }
}

export const recapStorageService = new RecapStorageService()
