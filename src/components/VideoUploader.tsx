import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Upload, X, File, Loader2, Clock } from 'lucide-react'
import type { VideoFile } from '../types'
import { formatVideoLength } from '../lib/utils'

interface VideoUploaderProps {
  onFileSelect: (file: VideoFile) => void
  selectedFile: VideoFile | null
  onRemoveFile: () => void
}

const VideoUploader = ({ 
  onFileSelect, 
  selectedFile, 
  onRemoveFile 
}: VideoUploaderProps) => {
  const [dragActive, setDragActive] = useState(false)
  const [reading, setReading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const supportedFormats = ['MP4', 'AVI', 'MOV', 'MKV']
  // Capped below WebAssembly's hard 4GB linear-memory limit - FFmpeg.wasm needs
  // room for the file bytes plus its own decode/encode buffers within that ceiling.
  const maxSize = 3.5 * 1024 * 1024 * 1024 // 3.5GB

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

  // Reads the video's duration from the browser's own metadata parsing -
  // fast and doesn't require loading FFmpeg. Resolves to undefined rather
  // than rejecting if the browser can't determine it, since duration is
  // shown as a helper and shouldn't block file selection.
  const getVideoDuration = (file: File): Promise<number | undefined> => {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      const objectUrl = URL.createObjectURL(file)
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(objectUrl)
        resolve(Number.isFinite(video.duration) ? video.duration : undefined)
      }
      video.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        resolve(undefined)
      }
      video.src = objectUrl
    })
  }

  // Read the file bytes eagerly as soon as the user selects a file.
  // Keeping only a raw File reference causes NotReadableError after
  // re-renders or user interactions that revoke the browser's implicit
  // file-read permission.
  const handleFileSelection = async (file: File) => {
    const fileExtension = file.name.split('.').pop()?.toUpperCase()
    if (!fileExtension || !supportedFormats.includes(fileExtension)) {
      alert(`סוג קובץ לא נתמך. קבצים נתמכים: ${supportedFormats.join(', ')}`)
      return
    }

    if (file.size > maxSize) {
      alert('הקובץ גדול מדי. גודל מקסימלי: 3.5GB')
      return
    }

    setReading(true)
    try {
      const [arrayBuffer, duration] = await Promise.all([
        file.arrayBuffer(),
        getVideoDuration(file),
      ])
      const buffer = new Uint8Array(arrayBuffer)

      const videoFile: VideoFile = {
        id: Date.now().toString(),
        name: file.name,
        size: file.size,
        type: file.type,
        file,
        buffer,
        duration,
      }

      onFileSelect(videoFile)
    } catch (err) {
      console.error('Failed to read file:', err)
      alert('לא ניתן לקרוא את הקובץ. אנא נסה שוב.')
    } finally {
      setReading(false)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const openFileDialog = () => {
    if (!reading) inputRef.current?.click()
  }

  // Reading state — show spinner while buffering
  if (reading) {
    return (
      <motion.div
        className="glass-bg rounded-lg p-8 border-2 border-blue-500/60 text-center"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <Loader2 className="h-10 w-10 text-blue-400 animate-spin mx-auto mb-3" />
        <p className="text-white font-medium">קורא את הקובץ...</p>
        <p className="text-gray-400 text-sm mt-1">אנא המתן</p>
      </motion.div>
    )
  }

  if (selectedFile) {
    return (
      <motion.div 
        className="glass-bg rounded-lg p-6 border-2 border-green-500/60"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 space-x-reverse">
            <File className="h-8 w-8 text-green-400" />
            <div>
              <h3 className="text-white font-medium">{selectedFile.name}</h3>
              <p className="text-gray-400 text-sm flex items-center gap-3">
                <span>{formatFileSize(selectedFile.size)}</span>
                {selectedFile.duration !== undefined && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    משך: {formatVideoLength(selectedFile.duration)}
                  </span>
                )}
              </p>
              {selectedFile.buffer && (
                <p className="text-green-500 text-xs mt-0.5">✓ נקרא בהצלחה</p>
              )}
            </div>
          </div>
          <button
            onClick={onRemoveFile}
            className="p-2 text-gray-400 hover:text-red-400 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
        dragActive
          ? 'border-blue-400 bg-blue-400/10'
          : 'border-white/20 glass-bg'
      }`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={openFileDialog}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".mp4,.avi,.mov,.mkv"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFileSelection(file)
          // Reset input so same file can be re-selected
          e.target.value = ''
        }}
        className="hidden"
      />

      <motion.div
        className="flex flex-col items-center"
        whileHover={{ scale: 1.02 }}
      >
        <Upload className="h-16 w-16 text-gray-400 mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">
          העלה קובץ וידאו
        </h3>
        <p className="text-gray-400 mb-4">
          גרור ושחרר קובץ או לחץ לבחירה
        </p>
        
        <div className="mt-4 text-center text-sm">
          <p className="text-gray-300">
            <span className="font-semibold">קבצים נתמכים:</span> {supportedFormats.join(', ')}
          </p>
          <p className="text-gray-300 mt-1">
            <span className="font-semibold">גודל מקסימלי:</span> 3.5GB
          </p>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default VideoUploader
