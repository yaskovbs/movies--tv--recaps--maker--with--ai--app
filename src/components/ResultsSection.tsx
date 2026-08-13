import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Download, Play, Pause, PlayCircle, Save, Eye, EyeOff, ThumbsUp, ThumbsDown } from 'lucide-react'
import type { RecapOutput } from '../types'
import { RecapSaver } from './RecapSaver'
import { addRating, hasRated as checkHasRated } from '../lib/stats'

interface ResultsSectionProps {
  output: RecapOutput
}

const ResultsSection = ({ output }: ResultsSectionProps) => {
  const { t } = useTranslation()
  const [showSaver, setShowSaver] = useState(false)
  const [hasRated, setHasRated] = useState(() => checkHasRated())
  const [isRating, setIsRating] = useState(false)

  // Video state
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Video controls
  const handleVideoPlayPause = () => {
    const video = videoRef.current;
    if (video) {
      if (isVideoPlaying) {
        video.pause();
      } else {
        video.play();
      }
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      const handlePlay = () => setIsVideoPlaying(true);
      const handlePause = () => setIsVideoPlaying(false);

      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);
      video.addEventListener('ended', handlePause);

      return () => {
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('ended', handlePause);
      };
    }
  }, []);

  // Quick like/dislike feedback on this recap, right where it's shown - no
  // save or sign-in required. Feeds the same shared, global rating shown in
  // the homepage's stats section (src/lib/stats.ts), so it's a one-time
  // signal per browser rather than per-recap: whichever comes first, this or
  // the homepage's own star widget, "uses up" the rating.
  const handleRating = async (liked: boolean) => {
    if (hasRated || isRating) return;
    setIsRating(true);
    try {
      await addRating(liked ? 5 : 1);
      setHasRated(true);
    } finally {
      setIsRating(false);
    }
  };

  return (
    <>
      <RecapSaver
        videoBlob={output.videoBlob}
        durationSeconds={output.durationSeconds}
        customAudioFile={output.customAudioFile}
        open={showSaver}
        onClose={() => setShowSaver(false)}
      />
      <motion.div
        className="space-y-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
      {/* Video Recap */}
      <div className="glass rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <h3 className="text-xl font-semibold text-white">{t('resultsSection.videoTitle')}</h3>
          {output.usedSmartSelection ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-300 bg-blue-500/15 border border-blue-400/30 rounded-full px-2.5 py-1">
              <Eye className="h-3 w-3" />
              {t('resultsSection.smartSelectionBadge')}
            </span>
          ) : output.watchedVideo ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-300 bg-amber-500/15 border border-amber-400/30 rounded-full px-2.5 py-1">
              <Eye className="h-3 w-3" />
              {t('resultsSection.smartSelectionBadgeWatchedNotUsed')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 bg-gray-500/15 border border-gray-400/30 rounded-full px-2.5 py-1">
              <EyeOff className="h-3 w-3" />
              {t('resultsSection.smartSelectionBadgeNo')}
            </span>
          )}
        </div>

        <div className="relative w-full rounded-lg overflow-hidden group mb-4">
          <video
            ref={videoRef}
            src={output.videoUrl}
            className="w-full cursor-pointer"
            onClick={handleVideoPlayPause}
          />
          {!isVideoPlaying && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40 cursor-pointer transition-opacity duration-300 group-hover:bg-opacity-50"
              onClick={handleVideoPlayPause}
            >
              <PlayCircle size={64} className="text-white opacity-80 hover:opacity-100 transition-opacity drop-shadow-lg" />
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-4 flex-wrap">
          <motion.button
            onClick={handleVideoPlayPause}
            className="flex items-center justify-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
          >
            {isVideoPlaying ? <Pause size={20} /> : <Play size={20} />}
            <span>{isVideoPlaying ? t('resultsSection.pauseVideo') : t('resultsSection.playVideo')}</span>
          </motion.button>
          <motion.a
            href={output.videoUrl}
            download="recap-video.mp4"
            className="flex items-center justify-center gap-2 px-8 py-3 bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white font-semibold rounded-lg transition-all duration-200"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
          >
            <Download className="h-5 w-5" />
            <span>{t('resultsSection.downloadVideo')}</span>
          </motion.a>
          <motion.button
            onClick={() => setShowSaver(true)}
            className="flex items-center justify-center gap-2 px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
          >
            <Save className="h-5 w-5" />
            <span>{t('resultsSection.saveRecap')}</span>
          </motion.button>
        </div>

        <div className="flex items-center justify-center gap-3 mt-4 text-sm text-gray-400">
          {hasRated ? (
            <span>{t('resultsSection.rateThanks')}</span>
          ) : (
            <>
              <span>{t('resultsSection.rateThisRecap')}</span>
              <button
                onClick={() => handleRating(true)}
                disabled={isRating}
                className="p-2 rounded-lg text-gray-400 hover:text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-50"
                title={t('resultsSection.rateGood')}
              >
                <ThumbsUp className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleRating(false)}
                disabled={isRating}
                className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                title={t('resultsSection.rateBad')}
              >
                <ThumbsDown className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
    </>
  )
}

export default ResultsSection
