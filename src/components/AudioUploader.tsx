import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Music, X, Loader2 } from 'lucide-react'
import type { AudioFile } from '../types'

interface AudioUploaderProps {
  onFileSelect: (file: AudioFile) => void
  selectedFile: AudioFile | null
  onRemoveFile: () => void
}

// Optional MP3 narration upload, offered before recap creation. When set, it's
// muxed into the FFmpeg output as the recap video's audio track (HomePage's
// handleCreateRecap) instead of leaving the video silent, and reused as the
// saved recap's audioUrl instead of generating text-to-speech (RecapSaver).
const AudioUploader = ({ onFileSelect, selectedFile, onRemoveFile }: AudioUploaderProps) => {
  const { t } = useTranslation()
  const [dragActive, setDragActive] = useState(false)
  const [reading, setReading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const maxSize = 100 * 1024 * 1024 // 100MB - generous for a voice narration track

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      handleFileSelection(files[0])
    }
  }

  const handleFileSelection = async (file: File) => {
    const isMp3 = file.name.toLowerCase().endsWith('.mp3') || file.type === 'audio/mpeg'
    if (!isMp3) {
      alert(t('audioUploader.unsupportedFormat', { formats: 'MP3' }))
      return
    }

    if (file.size > maxSize) {
      alert(t('audioUploader.fileTooLarge'))
      return
    }

    setReading(true)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const audioFile: AudioFile = {
        id: Date.now().toString(),
        name: file.name,
        size: file.size,
        file,
        buffer: new Uint8Array(arrayBuffer),
      }
      onFileSelect(audioFile)
    } catch (err) {
      console.error('Failed to read audio file:', err)
      alert(t('audioUploader.readError'))
    } finally {
      setReading(false)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const openFileDialog = () => {
    if (!reading) inputRef.current?.click()
  }

  if (reading) {
    return (
      <motion.div
        className="glass-bg rounded-lg p-4 border-2 border-blue-500/60 text-center"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <Loader2 className="h-6 w-6 text-blue-400 animate-spin mx-auto mb-2" />
        <p className="text-white text-sm font-medium">{t('audioUploader.readingTitle')}</p>
      </motion.div>
    )
  }

  if (selectedFile) {
    return (
      <motion.div
        className="glass-bg rounded-lg p-4 border-2 border-green-500/60"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 space-x-reverse min-w-0">
            <Music className="h-6 w-6 text-green-400 flex-shrink-0" />
            <div className="min-w-0">
              <h3 className="text-white text-sm font-medium truncate">{selectedFile.name}</h3>
              <p className="text-gray-400 text-xs">{formatFileSize(selectedFile.size)}</p>
            </div>
          </div>
          <button
            onClick={onRemoveFile}
            className="p-2 text-gray-400 hover:text-red-400 transition-colors flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className={`relative border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
        dragActive ? 'border-blue-400 bg-blue-400/10' : 'border-white/20 glass-bg'
      }`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={openFileDialog}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,audio/mpeg"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFileSelection(file)
          e.target.value = ''
        }}
        className="hidden"
      />

      <div className="flex items-center gap-3">
        <Music className="h-6 w-6 text-gray-400 flex-shrink-0" />
        <div className="text-right flex-1">
          <p className="text-sm font-medium text-white">{t('audioUploader.title')}</p>
          <p className="text-gray-400 text-xs">{t('audioUploader.subtitle')}</p>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-2">{t('audioUploader.hint')}</p>
    </motion.div>
  )
}

export default AudioUploader
