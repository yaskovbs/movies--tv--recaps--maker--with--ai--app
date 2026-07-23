import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Settings, Clock, Scissors, FileVideo, Film, Youtube, Globe } from 'lucide-react'
import type { RecapSettings } from '../types'
import { formatVideoLength } from '../lib/utils'

interface RecapSettingsProps {
  settings: RecapSettings;
  onSettingsChange: (settings: RecapSettings) => void;
  videoDuration?: number; // משך הסרטון שהועלה, בשניות
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
  videoDuration
}: RecapSettingsProps) => {
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
    if (videoDuration === undefined || videoDuration <= 0 || settings.duration <= 0) return
    const idealInterval = Math.max(
      settings.captureSeconds,
      Math.round((videoDuration * settings.captureSeconds) / settings.duration)
    )
    if (idealInterval !== settings.intervalSeconds) {
      handleChange('intervalSeconds', idealInterval)
    }
    // Only recompute when the video or the desired recap duration change -
    // not on every render, and not when the user is mid-edit of the interval itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoDuration, settings.duration, settings.captureSeconds])

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

  return (
    <motion.div 
      className="glass rounded-lg p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <div className="flex items-center mb-6">
        <Settings className="h-6 w-6 text-blue-400 ml-3" />
        <h2 className="text-xl font-semibold text-white">הגדרות סיכום</h2>
      </div>

      <div className="space-y-6">
        {/* כותרת הסרט/סדרה */}
        <div>
          <label className="flex items-center text-sm font-medium text-gray-300 mb-2">
            <Film className="h-4 w-4 ml-2" />
            כותרת הסרט/סדרה *
          </label>
          <input
            type="text"
            value={settings.title}
            onChange={(e) => handleChange('title', e.target.value)}
            placeholder="לדוגמה: אינספשן, ברייקינג באד..."
            className="w-full px-3 py-2 glass-input rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* ז'אנר */}
        <div>
          <label className="flex items-center text-sm font-medium text-gray-300 mb-2">
            <Film className="h-4 w-4 ml-2" />
            ז'אנר
          </label>
          <select
            value={settings.genre}
            onChange={(e) => handleChange('genre', e.target.value)}
            className="w-full px-3 py-2 glass-input rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">בחר ז'אנר...</option>
            <option value="action">אקשן</option>
            <option value="comedy">קומדיה</option>
            <option value="drama">דרמה</option>
            <option value="thriller">מתח</option>
            <option value="horror">אימה</option>
            <option value="sci-fi">מדע בדיוני</option>
            <option value="fantasy">פנטזיה</option>
            <option value="romance">רומנטי</option>
            <option value="documentary">דוקומנטרי</option>
            <option value="animation">אנימציה</option>
          </select>
        </div>

        {/* אורך הסיכום */}
        <div>
          <label className="flex items-center text-sm font-medium text-gray-300 mb-2">
            <Clock className="h-4 w-4 ml-2" />
            אורך הסיכום (עד 3 שעות)
          </label>
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
              <p className="text-xs text-gray-400 text-center mt-1">שעות</p>
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
              <p className="text-xs text-gray-400 text-center mt-1">דקות</p>
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
              <p className="text-xs text-gray-400 text-center mt-1">שניות</p>
            </div>
          </div>
        </div>

        {/* תדירות חיתוך */}
        <div>
          <label className="flex items-center text-sm font-medium text-gray-300 mb-2">
            <Scissors className="h-4 w-4 ml-2" />
            חתוך כל (דקות : שניות)
          </label>
          {videoDuration !== undefined && (
            <p className="text-xs text-blue-300 mb-2">
              משך הסרטון שהעליתם: {formatVideoLength(videoDuration)} ({Math.round(videoDuration)} שניות) - הערך מחושב אוטומטית לפי אורך הסיכום שבחרתם, ואפשר לשנות אותו ידנית
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
            כל {intervalMinutes > 0 ? `${intervalMinutes} דקות ו-` : ''}{intervalRemainingSeconds} שניות ייחתך קטע של שנייה אחת.
          </p>
          {videoDuration !== undefined && settings.intervalSeconds >= videoDuration && (
            <p className="text-xs text-amber-400 mt-1">
              ⚠ הערך גדול מאורך הסרטון עצמו ({formatVideoLength(videoDuration)}) - יתקבל קטע אחד בלבד. בחרו ערך קטן יותר.
            </p>
          )}
        </div>

        {/* תיאור נוסף */}
        <div>
          <label className="flex items-center text-sm font-medium text-gray-300 mb-2">
            <FileVideo className="h-4 w-4 ml-2" />
            תיאור נוסף *
          </label>
          <textarea
            value={settings.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="תארו את עלילת הסרט/הסדרה, הדמויות והאירועים המרכזיים - הסיכום ייווצר בעיקר על סמך הטקסט הזה..."
            className="w-full px-3 py-2 glass-input rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={3}
          />
          <p className="text-xs text-gray-400 mt-1">
            ככל שהתיאור מפורט ומדויק יותר, כך הסיכום שנוצר יהיה נאמן יותר לטקסט שהזנתם.
          </p>
        </div>

        {/* YouTube Data API v3 Key */}
        <div>
          <label className="flex items-center text-sm font-medium text-gray-300 mb-2">
            <Youtube className="h-4 w-4 ml-2" />
            YouTube Data API v3 Key (אופציונלי)
          </label>
          <input
            type="text"
            value={settings.youtubeApiKey}
            onChange={(e) => handleChange('youtubeApiKey', e.target.value)}
            placeholder="הזן מפתח YouTube Data API v3 לטעינת סרטוני ערוץ..."
            className="w-full px-3 py-2 glass-input rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <a 
            href="https://developers.google.com/youtube/v3/getting-started" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block"
          >
            איך להשיג מפתח YouTube Data API
          </a>
        </div>

        {/* קישור יוטיוב ללמידה */}
        <div>
          <label className="flex items-center text-sm font-medium text-gray-300 mb-2">
            <Youtube className="h-4 w-4 ml-2" />
            קישור יוטיוב ללמידה (אופציונלי)
          </label>
          <div className="flex space-x-2 space-x-reverse mb-2">
            <button
              onClick={() => handleChange('linkType', 'single')}
              className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                settings.linkType === 'single'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
              }`}
            >
              סרטון יחיד
            </button>
            <button
              onClick={() => handleChange('linkType', 'channel')}
              className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                settings.linkType === 'channel'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
              }`}
            >
              ערוץ שלם
            </button>
          </div>
          <input
            type="text"
            value={settings.youtubeLink}
            onChange={(e) => handleChange('youtubeLink', e.target.value)}
            placeholder="הכנס קישור ליוטיוב כדי שה-AI ילמד מסגנון הסיכום..."
            className="w-full px-3 py-2 glass-input rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            ה-AI ילמד מסגנון הסיכום בסרטון כדי לשפר את איכות הסיכומים שלו
          </p>
        </div>

        {/* חיפוש באינטרנט */}
        <div className="glass-subtle rounded-lg p-4">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.webSearch}
              onChange={(e) => handleChange('webSearch', e.target.checked)}
              className="w-5 h-5 rounded bg-white/10 border-white/20 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 ml-3"
            />
            <div className="flex items-center flex-1">
              <Globe className="h-4 w-4 ml-2 text-blue-400" />
              <div>
                <span className="text-sm font-medium text-white">חיפוש באינטרנט לסיכום מדויק יותר</span>
                <p className="text-xs text-gray-400 mt-0.5">
                  כשמופעל, המערכת תחפש מידע אמיתי על הסרט/סדרה באינטרנט ותשתמש בו ליצירת סיכום מדויק ואיכותי יותר
                </p>
              </div>
            </div>
          </label>
        </div>

        {/* סיכום הגדרות */}
        <div className="glass-subtle rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-2">סיכום הגדרות:</h3>
          <div className="text-sm text-gray-400 space-y-1">
            <p>• אורך סיכום: {formatDuration(settings.duration)}</p>
            <p>• חיתוך כל: {formatDuration(settings.intervalSeconds)}</p>
            <p>• קטעים כוללים: ~{settings.intervalSeconds > 0 ? Math.floor(settings.duration / settings.intervalSeconds) : 0} קטעים</p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default RecapSettingsComponent
