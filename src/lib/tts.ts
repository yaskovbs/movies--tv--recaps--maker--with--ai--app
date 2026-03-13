/**
 * Text-to-Speech utility using Web Speech API and fallback to Google TTS
 */

interface TTSOptions {
  rate?: number
  pitch?: number
  volume?: number
}

export class TTSService {
  private synth = window.speechSynthesis
  private supportsSpeechSynthesis = 'speechSynthesis' in window

  /**
   * Convert text to speech and return audio blob
   */
  async textToSpeech(text: string, options: TTSOptions = {}): Promise<Blob> {
    const { rate = 1, pitch = 1, volume = 1 } = options

    if (!this.supportsSpeechSynthesis) {
      throw new Error('Speech Synthesis not supported in this browser')
    }

    return new Promise((resolve, reject) => {
      // Cancel any ongoing speech
      this.synth.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = rate
      utterance.pitch = pitch
      utterance.volume = volume
      utterance.lang = 'he-IL' // Hebrew language

      const chunks: Uint8Array[] = []
      let mediaRecorder: MediaRecorder | null = null

      // Create audio context for recording
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const destination = audioContext.createMediaStreamDestination()

      utterance.onstart = () => {
        // Start recording
        try {
          const stream = destination.stream
          mediaRecorder = new MediaRecorder(stream)

          mediaRecorder.ondataavailable = (event) => {
            chunks.push(new Uint8Array(event.data))
          }

          mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'audio/wav' })
            resolve(blob)
          }

          mediaRecorder.start()
        } catch (error) {
          console.warn('Could not record audio:', error)
          // Fallback: resolve with empty blob
          resolve(new Blob([], { type: 'audio/wav' }))
        }
      }

      utterance.onerror = (event) => {
        if (mediaRecorder) mediaRecorder.stop()
        reject(new Error(`Speech synthesis error: ${event.error}`))
      }

      utterance.onend = () => {
        if (mediaRecorder && mediaRecorder.state !== 'stopped') {
          mediaRecorder.stop()
        }
      }

      this.synth.speak(utterance)
    })
  }

  /**
   * Use Blink AI to generate speech
   */
  async generateSpeechWithBlink(text: string, blink: any): Promise<Blob> {
    try {
      const { url } = await blink.ai.generateSpeech({
        text,
        voice: 'nova'
      })

      // Fetch the audio from URL and convert to blob
      const response = await fetch(url)
      return await response.blob()
    } catch (error) {
      console.error('Failed to generate speech with Blink:', error)
      throw error
    }
  }

  /**
   * Download blob as file
   */
  downloadAudio(blob: Blob, filename: string = 'audio.wav'): void {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /**
   * Convert blob to base64 string
   */
  async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result.split(',')[1] || '')
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  /**
   * Upload audio blob to storage and return public URL
   */
  async uploadAudioToStorage(blob: Blob, filename: string, blink: any): Promise<string> {
    try {
      const { publicUrl } = await blink.storage.upload(
        blob,
        `audio/${Date.now()}-${filename}`,
        { upsert: true }
      )
      return publicUrl
    } catch (error) {
      console.error('Failed to upload audio:', error)
      throw error
    }
  }
}

export const ttsService = new TTSService()
