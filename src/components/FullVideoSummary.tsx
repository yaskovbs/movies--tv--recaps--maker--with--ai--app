import { Fragment, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { FileText, Loader2, Copy } from 'lucide-react'
import type { VideoFile, GeminiFileRef } from '../types'
import { uploadFileToGemini, guessVideoMimeType, isGeminiSupportedVideoFormat, getFullVideoRecap, deleteGeminiFile, GEMINI_VIDEO_SIZE_CAP } from '../lib/gemini'
import VideoChat from './VideoChat'

interface FullVideoSummaryProps {
  selectedFile: VideoFile
  apiKey: string
  description: string
}

type Status = 'idle' | 'working' | 'done' | 'error'

// Offered right after uploading a video, before creating/cutting anything -
// a one-click way to get a full text recap of the whole video from Gemini,
// separate from both the segment-selection step (which only runs once
// "Create Recap" is clicked) and the open-ended video chat (which only
// appears after a recap has been created). Uploads the video to Gemini
// itself rather than waiting for the creation flow to do it.
const FullVideoSummary = ({ selectedFile, apiKey, description }: FullVideoSummaryProps) => {
  const { t } = useTranslation()
  const [status, setStatus] = useState<Status>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [summary, setSummary] = useState('')
  const [error, setError] = useState('')
  const [isCopied, setIsCopied] = useState(false)
  // Kept so the chat below can reuse the same Gemini File API upload instead
  // of uploading the video a second time.
  const [fileRef, setFileRef] = useState<GeminiFileRef | null>(null)

  // Deletes the previous upload from Gemini whenever it's replaced (e.g. the
  // user clicks "regenerate") or this component unmounts (e.g. they remove
  // the video or navigate away) - every upload counts against a shared,
  // cumulative storage quota until deleted, so cleaning up here matters.
  useEffect(() => {
    return () => {
      if (fileRef) {
        deleteGeminiFile(fileRef.name, apiKey)
      }
    }
  }, [fileRef, apiKey])

  const handleGetSummary = async () => {
    if (!apiKey) {
      setError(t('fullVideoSummary.errorNoApiKey'))
      setStatus('error')
      return
    }
    if (selectedFile.file.size > GEMINI_VIDEO_SIZE_CAP) {
      setError(t('fullVideoSummary.errorTooLarge'))
      setStatus('error')
      return
    }
    if (!isGeminiSupportedVideoFormat(selectedFile.name)) {
      setError(t('fullVideoSummary.errorUnsupportedFormat'))
      setStatus('error')
      return
    }

    setStatus('working')
    setError('')
    setStatusMessage(t('fullVideoSummary.uploading'))

    try {
      const uploadedFileRef = await uploadFileToGemini(
        selectedFile.file,
        apiKey,
        guessVideoMimeType(selectedFile.name),
        22 * 60 * 1000,
        (elapsedMs) => {
          const totalSeconds = Math.round(elapsedMs / 1000)
          const minutes = Math.floor(totalSeconds / 60)
          const seconds = totalSeconds % 60
          setStatusMessage(
            t('fullVideoSummary.processingElapsed', {
              time: `${minutes}:${seconds.toString().padStart(2, '0')}`,
            })
          )
        }
      )
      // Set as soon as the upload succeeds, not after the recap text is also
      // generated - so the cleanup effect above can still delete it from
      // Gemini even if the recap-writing step below fails.
      setFileRef(uploadedFileRef)

      setStatusMessage(t('fullVideoSummary.writing'))
      const text = await getFullVideoRecap(uploadedFileRef, apiKey, description)

      setSummary(text)
      setStatus('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('fullVideoSummary.errorGeneric'))
      setStatus('error')
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(summary)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  return (
    <Fragment>
      <motion.div
        className="glass rounded-lg p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
      <div className="flex items-center gap-2 mb-2">
        <FileText className="h-5 w-5 text-blue-400" />
        <h3 className="text-lg font-semibold text-white">{t('fullVideoSummary.title')}</h3>
      </div>
      <p className="text-sm text-gray-400 mb-4">{t('fullVideoSummary.subtitle')}</p>

      {status !== 'done' && (
        <button
          onClick={handleGetSummary}
          disabled={status === 'working'}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
        >
          {status === 'working' ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>{statusMessage}</span>
            </>
          ) : (
            <span>{t('fullVideoSummary.button')}</span>
          )}
        </button>
      )}

      {status === 'error' && (
        <p className="text-sm text-red-400 mt-3">{error}</p>
      )}

      {status === 'done' && (
        <div>
          <textarea
            readOnly
            value={summary}
            className="w-full h-56 glass-bg text-gray-300 p-3 rounded-lg border border-white/10 resize-none text-sm"
          />
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              <Copy className="h-4 w-4" />
              {isCopied ? t('fullVideoSummary.copied') : t('fullVideoSummary.copy')}
            </button>
            <button
              onClick={handleGetSummary}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium rounded-lg transition-colors"
            >
              {t('fullVideoSummary.regenerate')}
            </button>
          </div>
        </div>
      )}

    </motion.div>

      {status === 'done' && fileRef && (
        <div className="mt-6">
          <VideoChat apiKey={apiKey} fileRef={fileRef} />
        </div>
      )}
    </Fragment>
  )
}

export default FullVideoSummary
