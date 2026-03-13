import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Download, Copy, Play, Pause, Square, PlayCircle, Save } from 'lucide-react'
import type { RecapOutput } from '../types'
import { RecapSaver } from './RecapSaver'

interface ResultsSectionProps {
  output: RecapOutput
}

const ResultsSection = ({ output }: ResultsSectionProps) => {
  const [isCopied, setIsCopied] = useState(false)
  const [showSaver, setShowSaver] = useState(false)
  
  // Audio state
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [allVoices, setAllVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [filteredVoices, setFilteredVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);

  // Video state
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      if (availableVoices.length === 0) return;

      setAllVoices(availableVoices);

      const uniqueLangs = [...new Set(availableVoices.map(v => v.lang))];
      setLanguages(uniqueLangs);

      const defaultLang = uniqueLangs.find(lang => lang.startsWith('he')) || uniqueLangs[0];
      setSelectedLanguage(defaultLang || '');
    };
    
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
  }, []);

  useEffect(() => {
    if (selectedLanguage) {
      const voicesForLang = allVoices.filter(v => v.lang === selectedLanguage);
      setFilteredVoices(voicesForLang);
      setSelectedVoice(voicesForLang[0] || null);
    }
  }, [selectedLanguage, allVoices]);

  const handleCopy = () => {
    navigator.clipboard.writeText(output.script);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Audio controls
  const handleAudioPlayPause = () => {
    if (isAudioPlaying) {
      window.speechSynthesis.pause();
      setIsAudioPlaying(false);
    } else {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      } else {
        const utterance = new SpeechSynthesisUtterance(output.script);
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }
        utterance.onend = () => setIsAudioPlaying(false);
        window.speechSynthesis.speak(utterance);
      }
      setIsAudioPlaying(true);
    }
  };

  const handleAudioStop = () => {
    window.speechSynthesis.cancel();
    setIsAudioPlaying(false);
  };

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

  const getDisplayLanguage = (langCode: string) => {
    try {
      const languageName = new Intl.DisplayNames(['en'], { type: 'language' }).of(langCode.split('-')[0]);
      return `${languageName} (${langCode})`;
    } catch {
      return langCode;
    }
  };

  return (
    <>
      <RecapSaver script={output.script} open={showSaver} onClose={() => setShowSaver(false)} />
      <motion.div
        className="space-y-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
      {/* 1. Video Recap */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-xl font-semibold text-white mb-4">סיכום וידאו (ללא קול)</h3>
        
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
            <span>{isVideoPlaying ? 'השהה' : 'נגן וידאו'}</span>
          </motion.button>
          <motion.a
            href={output.videoUrl}
            download="recap-video.mp4"
            className="flex items-center justify-center gap-2 px-8 py-3 bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white font-semibold rounded-lg transition-all duration-200"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
          >
            <Download className="h-5 w-5" />
            <span>הורד וידאו</span>
          </motion.a>
          <motion.button
            onClick={() => setShowSaver(true)}
            className="flex items-center justify-center gap-2 px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
          >
            <Save className="h-5 w-5" />
            <span>שמור סיכום</span>
          </motion.button>
        </div>
      </div>

      {/* 2. Generated Script */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-xl font-semibold text-white mb-4">תסריט שנוצר</h3>
        <textarea
          readOnly
          value={output.script}
          className="w-full h-48 bg-gray-900 text-gray-300 p-3 rounded-lg border border-gray-600 resize-none"
        />
        <button
          onClick={handleCopy}
          className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 flex items-center justify-center"
        >
          <Copy className="h-5 w-5 ml-2" />
          {isCopied ? 'הועתק!' : 'העתק תסריט'}
        </button>
      </div>

      {/* 3. Audio Voice-over */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-xl font-semibold text-white mb-4">קריינות אודיו</h3>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-400 block mb-2">בחר שפה:</label>
            <select 
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
                {languages.map(lang => (
                    <option key={lang} value={lang}>{getDisplayLanguage(lang)}</option>
                ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-gray-400 block mb-2">בחר קול:</label>
            <select 
                value={selectedVoice?.name || ''}
                onChange={(e) => setSelectedVoice(allVoices.find(v => v.name === e.target.value) || null)}
                disabled={filteredVoices.length === 0}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
                {filteredVoices.map(voice => (
                    <option key={voice.name} value={voice.name}>{voice.name}</option>
                ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-6">
            <button onClick={handleAudioPlayPause} className="p-4 bg-blue-600 rounded-full text-white hover:bg-blue-700 transition-colors">
                {isAudioPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>
            <button onClick={handleAudioStop} className="p-4 bg-red-600 rounded-full text-white hover:bg-red-700 transition-colors">
                <Square size={24} />
            </button>
        </div>
        
        <p className="text-xs text-gray-500 mt-4 text-center">הורדת קובץ האודיו אינה נתמכת כרגע.</p>
      </div>
    </motion.div>
    </>
  )
}

export default ResultsSection
