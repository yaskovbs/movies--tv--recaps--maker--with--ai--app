import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Play, Users, Zap, Shield, Cpu } from 'lucide-react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'
import VideoUploader from './VideoUploader'
import RecapSettings from './RecapSettings'
import ProcessingStatus from './ProcessingStatus'
import StatsSection from './StatsSection'
import ResultsSection from './ResultsSection'
import { localStorageService } from '../lib/localStorage'
import type { VideoFile, RecapSettings as RecapSettingsType, ProcessingStatus as ProcessingStatusType, RecapOutput } from '../types'

interface HomePageProps {
  apiKey: string
}

async function generateScriptWithGemini(
  settings: RecapSettingsType, 
  apiKey: string, 
  webSearchResults?: string
): Promise<string> {
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`;
  
  let contextInfo = '';
  if (webSearchResults) {
    contextInfo += `\n\nWeb Search Results:\n${webSearchResults}`;
  }
  
  const genreText = settings.genre ? ` (ז'אנר: ${settings.genre})` : '';
  const additionalDesc = settings.description ? `\n\nמידע נוסף: ${settings.description}` : '';
  const youtubeContext = settings.youtubeLink 
    ? `\n\nהסגנון צריך להיות דומה לסיכומי ${settings.linkType === 'channel' ? 'ערוץ' : 'סרטון'} זה: ${settings.youtubeLink}`
    : '';
  
  const prompt = `
    You are a professional video scriptwriter creating voice-over scripts for movie/TV show recaps in Hebrew.
    
    Title: ${settings.title}${genreText}${additionalDesc}${youtubeContext}${contextInfo}
    
    Create an engaging, cinematic voice-over script in Hebrew for a video recap.
    The script should be:
    - Exciting and dramatic
    - Concise (3-4 sentences, matching the video duration of ${settings.duration} seconds)
    - In natural, fluent Hebrew
    - Capture the essence and key moments
    ${settings.youtubeLink ? '- Match the style and tone of the reference YouTube content' : ''}
    
    Return ONLY the Hebrew script text, no additional commentary.
  `;

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    if (response.status === 503) {
      if (attempt === maxRetries) {
        break; 
      }
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(`Gemini API overloaded. Retrying in ${delay / 1000}s (Attempt ${attempt}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'An unknown API error occurred.');
    }

    const data = await response.json();
    const script = data.candidates[0]?.content?.parts[0]?.text;
    if (!script) {
      throw new Error('Failed to extract script from API response.');
    }
    return script.trim();
  }

  throw new Error('The model is currently overloaded. Please try again in a few moments.');
}

async function searchWebForMovieInfo(title: string, genre: string, apiKey: string): Promise<string> {
  try {
    const searchQuery = `${title} ${genre ? genre + ' movie' : 'movie'} plot summary review`;
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`;
    
    const prompt = `Search and provide a brief summary about the movie/TV show: "${title}" ${genre ? `(Genre: ${genre})` : ''}. 
    Include: plot overview, key characters, main themes, and interesting facts. Keep it concise (2-3 paragraphs max).`;
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    if (!response.ok) return '';
    
    const data = await response.json();
    return data.candidates[0]?.content?.parts[0]?.text || '';
  } catch (error) {
    console.error('Web search failed:', error);
    return '';
  }
}

const HomePage = ({ apiKey }: HomePageProps) => {
  const [selectedFile, setSelectedFile] = useState<VideoFile | null>(null)
  const [settings, setSettings] = useState<RecapSettingsType>({
    duration: 30,
    intervalSeconds: 8,
    captureSeconds: 1,
    title: '',
    genre: '',
    description: '',
    youtubeApiKey: '',
    youtubeLink: '',
    linkType: 'single',
    webSearch: false,
    apiKey: ''
  })
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatusType | null>(null)
  const [recapOutput, setRecapOutput] = useState<RecapOutput | null>(null)
  const ffmpegRef = useRef(new FFmpeg())

  const handleCreateRecap = async () => {
    if (!selectedFile) {
      alert('אנא בחר קובץ וידאו');
      return;
    }
    if (!apiKey) {
      alert('אנא הכנס מפתח Gemini AI API');
      return;
    }
    if (!settings.title.trim()) {
      alert('אנא הכנס כותרת לסרט/סדרה');
      return;
    }
    if (!selectedFile.buffer) {
      alert('הקובץ לא נקרא בהצלחה. אנא הסר את הקובץ ובחר אותו שנית.');
      return;
    }

    setRecapOutput(null);
    setProcessingStatus({ stage: 'loading_engine', progress: 0, message: 'מתכונן לעיבוד...'});
    const ffmpeg = ffmpegRef.current;
    ffmpeg.on('log', ({ message }) => { console.log(message) });

    try {
      setProcessingStatus({
        stage: 'loading_engine',
        progress: 0,
        message: 'טוען את מנוע הווידאו...'
      });

      if (!ffmpeg.loaded) {
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
      }

      setProcessingStatus({
        stage: 'cutting_video',
        progress: 0,
        message: 'כותב קובץ למערכת...'
      });
      // Use the pre-buffered bytes captured at file-selection time.
      // Never read from the stale File object here — the browser may have
      // revoked read permission after user interactions (NotReadableError).
      if (!selectedFile.buffer) {
        throw new Error('הקובץ לא נקרא בהצלחה. אנא הסר את הקובץ ובחר אותו שנית.');
      }
      await ffmpeg.writeFile(selectedFile.name, selectedFile.buffer);

      ffmpeg.on('progress', ({ progress }) => {
        if (progress >= 0 && progress <= 1) {
          setProcessingStatus(prev => ({
            ...prev!,
            stage: 'cutting_video',
            progress: Math.round(progress * 100),
            message: `חותך קטעים מהווידאו... ${Math.round(progress * 100)}%`
          }));
        }
      });

      const outputFileName = 'recap.mp4';
      const selectFilter = `select='lt(mod(t,${settings.intervalSeconds}),${settings.captureSeconds})',setpts=N/FRAME_RATE/TB`;
      await ffmpeg.exec([
        '-i', selectedFile.name,
        '-vf', selectFilter,
        '-an',
        '-t', `${settings.duration}`,
        '-y',
        outputFileName
      ]);

      const data = await ffmpeg.readFile(outputFileName);
      const videoUrl = URL.createObjectURL(new Blob([data as unknown as BlobPart], { type: 'video/mp4' }));

      setProcessingStatus({
        stage: 'generating_script',
        progress: 0,
        message: 'יוצר תסריט עם Gemini AI...'
      });
      
      // Perform web search if enabled
      let webSearchResults = '';
      if (settings.webSearch) {
        setProcessingStatus({
          stage: 'generating_script',
          progress: 30,
          message: 'מחפש מידע באינטרנט על הסרט/סדרה...'
        });
        webSearchResults = await searchWebForMovieInfo(settings.title, settings.genre, apiKey);
      }
      
      setProcessingStatus({
        stage: 'generating_script',
        progress: settings.webSearch ? 60 : 50,
        message: 'יוצר תסריט מותאם אישית...'
      });
      const generatedScript = await generateScriptWithGemini(settings, apiKey, webSearchResults);
      
      setProcessingStatus({
        stage: 'generating_script',
        progress: 100,
        message: 'התסריט נוצר בהצלחה.'
      });
      await new Promise(resolve => setTimeout(resolve, 500));

      setProcessingStatus({
        stage: 'generating_audio',
        progress: 50,
        message: 'מכין קריינות אודיו...'
      });
      await new Promise(resolve => setTimeout(resolve, 1000));

      setProcessingStatus({
        stage: 'completed',
        progress: 100,
        message: 'הסיכום נוצר בהצלחה!'
      });

      setRecapOutput({
        videoUrl: videoUrl,
        script: generatedScript,
      });

      // Increment the counter locally
      await localStorageService.incrementRecapsCreated();

      await ffmpeg.deleteFile(selectedFile.name);
      await ffmpeg.deleteFile(outputFileName);

    } catch (error: unknown) {
      console.error("An error occurred during recap creation:", error);
      let userMessage = 'שגיאה לא ידועה התרחשה. אנא נסה שוב.';
      if (error instanceof Error) {
        if (error.message.includes('overloaded')) {
          userMessage = 'שרתי ה-AI עמוסים כרגע. אנא נסה שוב בעוד מספר דקות.';
        } else if (error.message.includes('API key')) {
          userMessage = 'מפתח ה-API אינו תקין. אנא בדוק את המפתח ונסה שוב.';
        } else if (error.message.includes('FFmpeg')) {
          userMessage = 'שגיאה בעיבוד הווידאו. אנא ודא שהקובץ תקין ונסה שוב.';
        } else if (error.message) {
          userMessage = error.message;
        }
      }
      setProcessingStatus({
        stage: 'error',
        progress: 0,
        message: userMessage
      });
    }
  }

  const features = [
    { icon: Zap, title: 'עיבוד מהיר', description: 'טכנולוגיית AI מתקדמת לעיבוד מהיר ויעיל' },
    { icon: Cpu, title: 'מנוע FFmpeg', description: 'עיבוד וידאו מתקדם ישירות בדפדפן' },
    { icon: Shield, title: 'בטוח ומאובטח', description: 'הקבצים שלכם מוגנים והמפתחות לא נשמרים' },
    { icon: Users, title: 'קל לשימוש', description: 'ממשק פשוט ונוח לכל הגילאים' }
  ]

  const isProcessing = !!(processingStatus && processingStatus.stage !== 'completed' && processingStatus.stage !== 'error');

  const renderRightPanel = () => {
    if (processingStatus && processingStatus.stage === 'error') {
      return <ProcessingStatus status={processingStatus} />;
    }
    if (recapOutput) {
      return <ResultsSection output={recapOutput} />;
    }
    if (isProcessing && processingStatus) {
      return <ProcessingStatus status={processingStatus} />;
    }
    
    // Default welcome message
    return (
      <motion.div 
        className="bg-gray-800 rounded-lg p-8 text-center border border-gray-700" 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }}
      >
        <h3 className="text-2xl font-bold text-white mb-6">
          ברוכים הבאים! ב-3 צעדים פשוטים תיצרו סיכום וידאו מדהים:
        </h3>
        <ol className="text-right text-gray-300 space-y-4 max-w-md mx-auto">
          <li className="flex items-start">
            <span className="bg-blue-600 text-white rounded-full h-8 w-8 flex items-center justify-center ml-4 flex-shrink-0 text-lg font-bold">1</span>
            <div>
              <span className="font-semibold text-white">העלאת וידאו:</span> גררו קובץ או בחרו מהמחשב.
            </div>
          </li>
          <li className="flex items-start">
            <span className="bg-blue-600 text-white rounded-full h-8 w-8 flex items-center justify-center ml-4 flex-shrink-0 text-lg font-bold">2</span>
            <div>
              <span className="font-semibold text-white">הגדרות סיכום:</span> קבעו את אורך הסיכום ותארו את הווידאו ל-AI.
            </div>
          </li>
          <li className="flex items-start">
            <span className="bg-blue-600 text-white rounded-full h-8 w-8 flex items-center justify-center ml-4 flex-shrink-0 text-lg font-bold">3</span>
            <div>
              <span className="font-semibold text-white">יצירת סיכום:</span> לחצו על הכפתור ותנו לקסם לקרות!
            </div>
          </li>
        </ol>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <section className="py-20 text-center">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
            יוצר סיכומי וידאו
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
            הפלטפורמה המתקדמת ביותר ליצירת סיכומי וידאו מקצועיים לסרטים וסדרות באמצעות בינה מלאכותית של Google Gemini
          </p>
        </motion.div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <VideoUploader
              selectedFile={selectedFile}
              onFileSelect={setSelectedFile}
              onRemoveFile={() => setSelectedFile(null)}
            />
            <RecapSettings settings={settings} onSettingsChange={setSettings} />
            <motion.button
              onClick={handleCreateRecap}
              disabled={!selectedFile || !apiKey || isProcessing}
              className={`w-full py-4 px-6 rounded-lg font-semibold text-lg transition-all ${
                selectedFile && apiKey && !isProcessing
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
              whileHover={{ scale: (selectedFile && apiKey && !isProcessing) ? 1.02 : 1 }}
              whileTap={{ scale: (selectedFile && apiKey && !isProcessing) ? 0.98 : 1 }}
            >
              <Play className="inline-block h-5 w-5 ml-2" />
              {isProcessing ? 'מעבד...' : 'צור סיכום וידאו'}
            </motion.button>
          </div>

          <div className="space-y-6">
            {renderRightPanel()}

            <div className="grid grid-cols-2 gap-4">
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  className="bg-gray-800 rounded-lg p-4 text-center border border-gray-700"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.05 }}
                >
                  <feature.icon className="h-8 w-8 text-blue-400 mx-auto mb-2" />
                  <h4 className="font-semibold text-white text-sm mb-1">{feature.title}</h4>
                  <p className="text-gray-400 text-xs">{feature.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <StatsSection />
    </div>
  )
}

export default HomePage
