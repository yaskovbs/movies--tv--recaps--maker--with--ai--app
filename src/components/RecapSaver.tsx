import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { uploadRecapFile } from '../lib/supabase'
import { recapStorageService } from '../lib/recapStorage'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { AlertCircle, Loader2 } from 'lucide-react'

interface RecapSaverProps {
  videoBlob: Blob
  durationSeconds: number
  customAudioFile?: File
  open: boolean
  onClose: () => void
}

export function RecapSaver({ videoBlob, durationSeconds, customAudioFile, open, onClose }: RecapSaverProps) {
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
      // Upload the generated video to persistent storage so it can actually
      // be saved and reopened later. Uses the Blob object handed down from
      // HomePage directly - it used to re-derive this via fetch(videoUrl),
      // but a blob: URL depends on the browser's internal blob registry,
      // which can evict the data (especially on mobile, under memory
      // pressure or after the tab is backgrounded) well before this
      // component's own reference to the Blob would be garbage-collected.
      // Holding the Blob itself sidesteps that failure mode entirely.
      setStage('video')
      let savedVideoUrl: string
      try {
        savedVideoUrl = await uploadRecapFile(
          videoBlob,
          `${Date.now()}-${title.trim().replace(/[^\w\-א-ת]+/g, '_')}.mp4`
        )
      } catch (e) {
        console.error('Could not upload the video to storage:', e)
        throw new Error(t('recapSaver.videoUploadError'))
      }

      // If the user supplied their own MP3 narration, it's already muxed into
      // the video - upload that same file as the recap's audioUrl too, so
      // History's audio controls have something to play/download. There's no
      // auto-generated narration fallback anymore (Supabase has no built-in
      // text-to-speech) - recaps without a custom MP3 simply have no separate
      // audio file, same as the video itself already being silent in that case.
      setStage('audio')
      let audioUrl = ''
      if (customAudioFile) {
        try {
          audioUrl = await uploadRecapFile(
            customAudioFile,
            `${Date.now()}-${title.trim().replace(/[^\w\-א-ת]+/g, '_')}.mp3`
          )
        } catch (e) {
          console.warn('Uploading custom narration failed, saving without a separate audio file', e)
        }
      }

      // Save recap to database
      setStage('saving')
      await recapStorageService.saveRecap({
        title,
        genre: genre || '',
        description: description || '',
        scriptText: '',
        audioUrl,
        videoUrl: savedVideoUrl,
        duration: durationSeconds,
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
