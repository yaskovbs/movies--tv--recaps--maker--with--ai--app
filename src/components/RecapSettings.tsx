import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Settings, Clock, Scissors, FileVideo, Film } from 'lucide-react'
import type { RecapSettings } from '../types'
import { formatVideoLength } from '../lib/utils'

interface RecapSettingsProps {
  settings: RecapSettings;
  onSettingsChange: (settings: RecapSettings) => void;
  videoDuration?: number; // משך הסרטון שהועלה, בשניות
  audioDuration?: number; // משך קובץ ה-MP3 שהועלה, בשניות - כשקיים, הוא קובע את אורך התקציר במקום ההגדרה הידנית
}

const formatDuration = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const paddedHours = String(hours).padStart(2, '0');
  const paddedMinutes = String(minutes).padStart(2, '0');
  const paddedSeconds = String(seconds).padStart(2, '0');

  if (hours > 0) {
    return `${paddedHours}:${paddedMinutes}:${paddedSeconds}`;
  }
  return `00:${paddedMinutes}:${paddedSeconds}`;
};

const RecapSettingsComponent = ({
  settings,
  onSettingsChange,
  videoDuration,
  audioDuration
}: RecapSettingsProps) => {
  const { t } = useTranslation()

  // Once an MP3 narration is uploaded, the recap's actual length always
  // matches that file exactly (see HomePage.handleCreateRecap) instead of
  // this manually-configured duration - so the interval sync below and the
  // summary at the bottom should reflect the length that will really be used.
  const effectiveDuration = audioDuration ?? settings.duration

  const handleChange = <K extends keyof RecapSettings>(field: K, value: RecapSettings[K]) => {
    onSettingsChange({
      ...settings,
      [field]: value
    })
  }

  // Keep the cut interval in sync with the video's real length and the chosen
  // recap duration, so spreading captures evenly across the whole video actually
  // adds up to the requested recap length (interval = video length / recap length,
  // scaled by how many seconds each cut captures).
  useEffect(() => {
    if (videoDuration === undefined || videoDuration <= 0 || effectiveDuration <= 0) return
    const idealInterval = Math.max(
      settings.captureSeconds,
      Math.round((videoDuration * settings.captureSeconds) / effectiveDuration)
    )
    if (idealInterval !== settings.intervalSeconds) {
      handleChange('intervalSeconds', idealInterval)
    }
    // Only recompute when the video or the desired recap duration change -
    // not on every render, and not when the user is mid-edit of the interval itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoDuration, effectiveDuration, settings.captureSeconds])

  const handleDurationChange = (part: 'hours' | 'minutes' | 'seconds', value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 0) return;

    const currentHours = Math.floor(settings.duration / 3600);
    const currentMinutes = Math.floor((settings.duration % 3600) / 60);
    const currentSeconds = settings.duration % 60;

    let newHours = currentHours;
    let newMinutes = currentMinutes;
    let newSeconds = currentSeconds;

    if (part === 'hours') newHours = numValue;
    if (part === 'minutes') newMinutes = numValue;
    if (part === 'seconds') newSeconds = numValue;

    let newTotalSeconds = (newHours * 3600) + (newMinutes * 60) + newSeconds;

    if (newTotalSeconds > 10800) {
      newTotalSeconds = 10800;
    }
    if (newTotalSeconds < 1) {
      newTotalSeconds = 1;
    }

    handleChange('duration', newTotalSeconds);
  };

  const durationHours = Math.floor(settings.duration / 3600);
  const durationMinutes = Math.floor((settings.duration % 3600) / 60);
  const durationSeconds = settings.duration % 60;

  const lockedByAudio = audioDuration !== undefined;

  const intervalMinutes = Math.floor(settings.intervalSeconds / 60);
  const intervalRemainingSeconds = settings.intervalSeconds % 60;

  const handleIntervalChange = (part: 'minutes' | 'seconds', value: string) => {
    const numValue = parseInt(value);
    if (isNaN(numValue) || numValue < 0) return;

    let newMinutes = intervalMinutes;
    let newSeconds = intervalRemainingSeconds;

    if (part === 'minutes') {
        newMinutes = numValue;
    } else { // 'seconds'
        newSeconds = numValue;
    }

    let newTotalSeconds = (newMinutes * 60) + newSeconds;

    if (newTotalSeconds < 1) {
        newTotalSeconds = 1;
    }

    handleChange('intervalSeconds', newTotalSeconds);
  };

  const genreOptions: Array<{ value: string; labelKey: string }> = [
    { value: 'action', labelKey: 'recapSettings.genres.action' },
    { value: 'comedy', labelKey: 'recapSettings.genres.comedy' },
    { value: 'drama', labelKey: 'recapSettings.genres.drama' },
    { value: 'thriller', labelKey: 'recapSettings.genres.thriller' },
    { value: 'horror', labelKey: 'recapSettings.genres.horror' },
    { value: 'sci-fi', labelKey: 'recapSettings.genres.sciFi' },
    { value: 'fantasy', labelKey: 'recapSettings.genres.fantasy' },
    { value: 'romance', labelKey: 'recapSettings.genres.romance' },
    { value: 'documentary', labelKey: 'recapSettings.genres.documentary' },
    { value: 'animation', labelKey: 'recapSettings.genres.animation' },
  ]

  return (
    <motion.div
      className="glass rounded-lg p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <div className="flex items-center mb-6">
        <Settings className="h-6 w-6 text-blue-400 ml-3" />
        <h2 className="text-xl font-semibold text-white">{t('recapSettings.title')}</h2>
      </div>

      <div className="space-y-6">
        {/* כותרת הסרט/סדרה */}
        <div>
          <label className="flex items-center text-sm font-medium text-gray-300 mb-2">
            <Film className="h-4 w-4 ml-2" />
            {t('recapSettings.movieTitleLabel')}
          </label>
          <input
            type="text"
            value={settings.title}
            onChange={(e) => handleChange('title', e.target.value)}
            placeholder={t('recapSettings.movieTitlePlaceholder')}
            className="w-full px-3 py-2 glass-input rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* ז'אנר */}
        <div>
          <label className="flex items-center text-sm font-medium text-gray-300 mb-2">
            <Film className="h-4 w-4 ml-2" />
            {t('recapSettings.genreLabel')}
          </label>
          <select
            value={settings.genre}
            onChange={(e) => handleChange('genre', e.target.value)}
            className="w-full px-3 py-2 glass-input rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{t('recapSettings.genrePlaceholder')}</option>
            {genreOptions.map((genre) => (
              <option key={genre.value} value={genre.value}>{t(genre.labelKey)}</option>
            ))}
          </select>
        </div>

        {/* אורך הסיכום */}
        <div>
          <label className="flex items-center text-sm font-medium text-gray-300 mb-2">
            <Clock className="h-4 w-4 ml-2" />
            {t('recapSettings.durationLabel')}
          </label>
          {lockedByAudio ? (
            <p className="text-xs text-blue-300 glass-subtle rounded-md px-3 py-2">
              {t('recapSettings.durationLockedByAudio', { length: formatDuration(audioDuration) })}
            </p>
          ) : (
            <div className="flex items-start space-x-2 space-x-reverse">
              <div className="flex-1">
                <input
                  type="number"
                  min="0"
                  max="3"
                  value={String(durationHours).padStart(2, '0')}
                  onChange={(e) => handleDurationChange('hours', e.target.value)}
                  className="w-full px-3 py-2 glass-input rounded-md text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 text-center mt-1">{t('recapSettings.hours')}</p>
              </div>
              <span className="text-xl font-bold text-gray-400 pt-2">:</span>
              <div className="flex-1">
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={String(durationMinutes).padStart(2, '0')}
                  onChange={(e) => handleDurationChange('minutes', e.target.value)}
                  className="w-full px-3 py-2 glass-input rounded-md text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 text-center mt-1">{t('recapSettings.minutes')}</p>
              </div>
              <span className="text-xl font-bold text-gray-400 pt-2">:</span>
              <div className="flex-1">
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={String(durationSeconds).padStart(2, '0')}
                  onChange={(e) => handleDurationChange('seconds', e.target.value)}
                  className="w-full px-3 py-2 glass-input rounded-md text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 text-center mt-1">{t('recapSettings.seconds')}</p>
              </div>
            </div>
          )}
        </div>

        {/* תדירות חיתוך */}
        <div>
          <label className="flex items-center text-sm font-medium text-gray-300 mb-2">
            <Scissors className="h-4 w-4 ml-2" />
            {t('recapSettings.intervalLabel')}
          </label>
          {videoDuration !== undefined && (
            <p className="text-xs text-blue-300 mb-2">
              {t('recapSettings.videoLengthInfo', {
                length: formatVideoLength(videoDuration),
                seconds: Math.round(videoDuration),
              })}
            </p>
          )}
          <div className="flex items-center space-x-2 space-x-reverse">
            <input
              type="number"
              min="0"
              max="59"
              value={intervalMinutes}
              onChange={(e) => handleIntervalChange('minutes', e.target.value)}
              className="w-full px-3 py-2 glass-input rounded-md text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="00"
            />
            <span className="text-xl font-bold text-gray-400">:</span>
            <input
              type="number"
              min="0"
              max="59"
              value={intervalRemainingSeconds}
              onChange={(e) => handleIntervalChange('seconds', e.target.value)}
              className="w-full px-3 py-2 glass-input rounded-md text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="08"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {t('recapSettings.intervalHint', { minutes: intervalMinutes, seconds: intervalRemainingSeconds })}
          </p>
          {videoDuration !== undefined && settings.intervalSeconds >= videoDuration && (
            <p className="text-xs text-amber-400 mt-1">
              {t('recapSettings.intervalWarning', { length: formatVideoLength(videoDuration) })}
            </p>
          )}
        </div>

        {/* תיאור נוסף */}
        <div>
          <label className="flex items-center text-sm font-medium text-gray-300 mb-2">
            <FileVideo className="h-4 w-4 ml-2" />
            {t('recapSettings.descriptionLabel')}
          </label>
          <textarea
            value={settings.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder={t('recapSettings.descriptionPlaceholder')}
            className="w-full px-3 py-2 glass-input rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={3}
          />
          <p className="text-xs text-gray-400 mt-1">
            {t('recapSettings.descriptionHint')}
          </p>
        </div>

        {/* סיכום הגדרות */}
        <div className="glass-subtle rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-2">{t('recapSettings.summaryTitle')}</h3>
          <div className="text-sm text-gray-400 space-y-1">
            <p>• {t('recapSettings.summaryLength', { length: formatDuration(effectiveDuration) })}</p>
            <p>• {t('recapSettings.summaryInterval', { interval: formatDuration(settings.intervalSeconds) })}</p>
            <p>• {t('recapSettings.summarySegments', { count: settings.intervalSeconds > 0 ? Math.floor(effectiveDuration / settings.intervalSeconds) : 0 })}</p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default RecapSettingsComponent
