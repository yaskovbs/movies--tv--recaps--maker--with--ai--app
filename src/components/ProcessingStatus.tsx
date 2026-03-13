import { motion } from 'framer-motion'
import { Loader2, CheckCircle, AlertCircle, Upload, Cog, Wand2, Mic } from 'lucide-react'
import type { ProcessingStatus } from '../types'

interface ProcessingStatusProps {
  status: ProcessingStatus
}

const ProcessingStatusComponent = ({ status }: ProcessingStatusProps) => {
  const getIcon = () => {
    switch (status.stage) {
      case 'loading_engine':
        return <Upload className="h-6 w-6" />
      case 'cutting_video':
        return <Cog className="h-6 w-6 animate-spin" />
      case 'generating_script':
        return <Wand2 className="h-6 w-6" />
       case 'generating_audio':
        return <Mic className="h-6 w-6" />
      case 'completed':
        return <CheckCircle className="h-6 w-6 text-green-400" />
      case 'error':
        return <AlertCircle className="h-6 w-6 text-red-400" />
      default:
        return <Loader2 className="h-6 w-6 animate-spin" />
    }
  }

  const getStageText = () => {
    switch (status.stage) {
      case 'loading_engine':
        return 'טוען מנוע וידאו...'
      case 'cutting_video':
        return 'מעבד וידאו...'
      case 'generating_script':
        return 'יוצר תסריט עם AI...'
      case 'generating_audio':
        return 'יוצר קריינות...'
      case 'completed':
        return 'הושלם בהצלחה!'
      case 'error':
        return 'שגיאה בעיבוד'
      default:
        return 'מתחיל עיבוד...'
    }
  }

  const getProgressBarColor = () => {
    switch (status.stage) {
      case 'completed':
        return 'bg-green-600'
      case 'error':
        return 'bg-red-600'
      default:
        return 'bg-blue-600'
    }
  }

  return (
    <motion.div 
      className="bg-gray-800 rounded-lg p-6 border border-gray-700"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center space-x-3 space-x-reverse mb-4">
        {getIcon()}
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white">{getStageText()}</h3>
          <p className="text-gray-400 text-sm">{status.message}</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-700 rounded-full h-3 mb-2">
        <motion.div 
          className={`h-3 rounded-full ${getProgressBarColor()}`}
          initial={{ width: 0 }}
          animate={{ width: `${status.progress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      <div className="flex justify-between text-sm text-gray-400">
        <span>{status.progress}% הושלם</span>
        <span>
          {status.stage === 'completed' ? 'מוכן' : 'אנא המתן...'}
        </span>
      </div>

      {/* Loading animation for active stages */}
      {status.stage !== 'completed' && status.stage !== 'error' && (
        <motion.div 
          className="mt-4 flex justify-center"
          animate={{ 
            scale: [1, 1.1, 1],
            opacity: [0.5, 1, 0.5] 
          }}
          transition={{ 
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        >
          <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
        </motion.div>
      )}
    </motion.div>
  )
}

export default ProcessingStatusComponent
