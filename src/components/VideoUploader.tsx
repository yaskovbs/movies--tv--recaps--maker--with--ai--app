import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Upload, X, File } from 'lucide-react'
import type { VideoFile } from '../types'

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
  const inputRef = useRef<HTMLInputElement>(null)

  const supportedFormats = ['MP4', 'AVI', 'MOV', 'MKV']
  const maxSize = 3 * 1024 * 1024 * 1024 // 3GB בבייטים

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

  const handleFileSelection = (file: File) => {
    // בדיקת סוג קובץ
    const fileExtension = file.name.split('.').pop()?.toUpperCase()
    if (!fileExtension || !supportedFormats.includes(fileExtension)) {
      alert(`סוג קובץ לא נתמך. קבצים נתמכים: ${supportedFormats.join(', ')}`)
      return
    }

    // בדיקת גודל קובץ
    if (file.size > maxSize) {
      alert('הקובץ גדול מדי. גודל מקסימלי: 3GB')
      return
    }

    const videoFile: VideoFile = {
      id: Date.now().toString(),
      name: file.name,
      size: file.size,
      type: file.type,
      file: file
    }

    onFileSelect(videoFile)
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const openFileDialog = () => {
    inputRef.current?.click()
  }

  if (selectedFile) {
    return (
      <motion.div 
        className="bg-gray-800 rounded-lg p-6 border-2 border-green-500"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 space-x-reverse">
            <File className="h-8 w-8 text-green-400" />
            <div>
              <h3 className="text-white font-medium">{selectedFile.name}</h3>
              <p className="text-gray-400 text-sm">{formatFileSize(selectedFile.size)}</p>
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
          : 'border-gray-600 bg-gray-800/50'
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
            <span className="font-semibold">גודל מקסימלי:</span> 3GB
          </p>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default VideoUploader