import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { blink } from '../lib/blink'
import { recapStorageService } from '../lib/recapStorage'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { AlertCircle, Loader2 } from 'lucide-react'

interface RecapSaverProps {
  script: string
  videoUrl: string
  customAudioFile?: File
  open: boolean
  onClose: () => void
}

export function RecapSaver({ script, videoUrl, customAudioFile, open, onClose }: RecapSaverProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [genre, setGenre] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stage, setStage] = useState<'video' | 'audio' | 'saving' | null>(null)

  const handleSave = async () => {
    if (!title.trim()) {
      setError(t('recapSaver.titleRequired'))
      return
    }

    setLoading(true)
    setError('')

    try {
      // Upload the generated video (a local blob: URL, only valid in this tab)
      // to persistent storage so it can actually be saved and reopened later.
      // Split into two distinct try/catch blocks on purpose: a raw browser
      // "Failed to fetch" doesn't say whether the problem is reading the
      // local blob or reaching Blink's storage API, and those need very
      // different fixes - this makes the error message tell us which.
      setStage('video')
      let videoBlob: Blob
      try {
        const response = await fetch(videoUrl)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        videoBlob = await response.blob()
      } catch (e) {
        console.error('Could not read the generated video from this tab:', e)
        throw new Error(t('recapSaver.videoReadError'))
      }

      let savedVideoUrl: string
      try {
        const result = await blink.storage.upload(
          videoBlob,
          `recaps/${Date.now()}-${title.trim().replace(/[^\w\-א-ת]+/g, '_')}.mp4`
        )
        savedVideoUrl = result.publicUrl
      } catch (e) {
        console.error('Could not upload the video to storage:', e)
        throw new Error(t('recapSaver.videoUploadError'))
      }

      // If the user supplied their own MP3 narration, it's already muxed into
      // the video - upload that same file as the recap's audioUrl instead of
      // generating a second, different-sounding text-to-speech narration.
      setStage('audio')
      let audioUrl = ''
      if (customAudioFile) {
        try {
          const { publicUrl } = await blink.storage.upload(
            customAudioFile,
            `recaps/${Date.now()}-${title.trim().replace(/[^\w\-א-ת]+/g, '_')}.mp3`
          )
          audioUrl = publicUrl
        } catch (e) {
          console.warn('Uploading custom narration failed, saving without a separate audio file', e)
        }
      } else {
        try {
          const { url } = await blink.ai.generateSpeech({
            text: script,
            voice: 'nova'
          })
          audioUrl = url
        } catch (e) {
          console.warn('TTS generation failed, saving without audio', e)
        }
      }

      // Save recap to database
      setStage('saving')
      await recapStorageService.saveRecap({
        // recapStorageService.saveRecap resolves the real userId itself
        // (signed-in user, or a per-browser anonymous ID) - this is ignored.
        userId: '',
        title,
        genre: genre || '',
        description: description || '',
        scriptText: script,
        audioUrl,
        videoUrl: savedVideoUrl,
        duration: Math.round(script.split(' ').length / 2.5),
        cutInterval: 0,
      })

      setLoading(false)
      setStage(null)
      setTitle('')
      setGenre('')
      setDescription('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('recapSaver.saveError'))
      setLoading(false)
      setStage(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="glass-strong border-white/15 text-white">
        <DialogHeader>
          <DialogTitle>{t('recapSaver.dialogTitle')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="flex gap-2 p-3 bg-red-900/20 border border-red-600 rounded text-sm text-red-200">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">{t('recapSaver.titleLabel')}</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('recapSaver.titlePlaceholder')}
              className="glass-input text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{t('recapSaver.genreLabel')}</label>
            <Input
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder={t('recapSaver.genrePlaceholder')}
              className="glass-input text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{t('recapSaver.descriptionLabel')}</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('recapSaver.descriptionPlaceholder')}
              className="glass-input text-white"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              {t('recapSaver.cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {stage === 'video' ? t('recapSaver.savingVideo')
                : stage === 'audio' ? (customAudioFile ? t('recapSaver.uploadingAudio') : t('recapSaver.generatingAudio'))
                : stage === 'saving' ? t('recapSaver.saving')
                : t('recapSaver.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
