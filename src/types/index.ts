export interface VideoFile {
  id: string
  name: string
  size: number
  type: string
  file: File
  buffer?: Uint8Array // pre-read bytes to avoid stale File reference errors
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
  stage: 'loading_engine' | 'cutting_video' | 'generating_script' | 'generating_audio' | 'completed' | 'error'
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
}
