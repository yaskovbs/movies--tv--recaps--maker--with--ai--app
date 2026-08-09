export interface VideoFile {
  id: string
  name: string
  size: number
  type: string
  file: File
  buffer?: Uint8Array // pre-read bytes to avoid stale File reference errors
  duration?: number // משך הסרטון בשניות, נקרא ממטא-דאטה של הדפדפן
}

export interface AudioFile {
  id: string
  name: string
  size: number
  file: File
  buffer: Uint8Array // pre-read bytes, written into ffmpeg's virtual FS to mux into the output video
}

export interface RecapSettings {
  duration: number // בשניות
  intervalSeconds: number // כל כמה שניות לחתוך
  captureSeconds: number // כמה שניות לקחת בכל פעם
  title: string // כותרת הסרט/סדרה
  genre: string // ז'אנר
  description: string // תיאור נוסף
  youtubeApiKey: string // YouTube Data API v3 Key
  youtubeLink: string // קישור יוטיוב ללמידה
  linkType: 'single' | 'channel' // סוג הקישור - סרטון יחיד או ערוץ שלם
  webSearch: boolean // חיפוש באינטרנט לסיכום מדויק יותר
  apiKey: string
}

export interface ProcessingStatus {
  stage: 'loading_engine' | 'analyzing_video' | 'cutting_video' | 'generating_script' | 'generating_audio' | 'completed' | 'error'
  progress: number
  message: string
  generatedVideoUrl?: string
}

export interface Stats {
  recapsCreated: number
  activeUsers: number
  uptime: number
  rating: number
}

export interface FAQ {
  question: string
  answer: string
}

export interface RecapOutput {
  videoUrl: string;
  script: string;
  // Set when the user supplied their own MP3 narration - it's already muxed
  // into videoUrl, and kept here so saving can upload the original file as
  // the recap's audioUrl too instead of generating text-to-speech audio.
  customAudioFile?: File;
  // True when Gemini watched the source video and picked the recap's segments
  // itself, instead of the fallback periodic "every N seconds" sampling.
  usedSmartSelection?: boolean;
}
