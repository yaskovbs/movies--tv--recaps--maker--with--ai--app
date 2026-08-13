import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Play, Users, Zap, Shield, Cpu } from 'lucide-react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'
import VideoUploader from './VideoUploader'
import AudioUploader from './AudioUploader'
import RecapSettings from './RecapSettings'
import ProcessingStatus from './ProcessingStatus'
import StatsSection from './StatsSection'
import ResultsSection from './ResultsSection'
import { incrementRecapsCreated } from '../lib/stats'
import type { VideoFile, AudioFile, RecapSettings as RecapSettingsType, ProcessingStatus as ProcessingStatusType, RecapOutput } from '../types'

interface HomePageProps {
  apiKey: string
}

interface GeminiFileRef {
  uri: string
  mimeType: string
}

// Movies/TV shows legitimately involve violence, crime, horror and other
// dark themes as part of the genre itself - Gemini's default safety
// thresholds (BLOCK_MEDIUM_AND_ABOVE) routinely false-positive on ordinary
// plot descriptions and video content that's just describing/showing an
// existing, already-published work, not generating original harmful
// content. Loosened to BLOCK_ONLY_HIGH (still blocks clearly extreme
// content) across every Gemini call in this file to cut down on SAFETY
// blocks on completely ordinary recap requests. Note: this does NOT affect
// PROHIBITED_CONTENT blocks - that's a separate, non-adjustable built-in
// protection (Google's own core-harm filter, e.g. child safety) with no API
// setting able to override it; see describeGeminiBlockReason() below.
const GEMINI_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
]

// Builds a user-facing message for a Gemini promptFeedback.blockReason.
// PROHIBITED_CONTENT gets distinct guidance since - unlike SAFETY - no
// safetySettings adjustment can affect it; the only fix is changing what was
// actually submitted (title/description text, or the video itself).
function describeGeminiBlockReason(blockReason: string | undefined): string {
  if (blockReason === 'PROHIBITED_CONTENT') {
    return 'Gemini blocked this content for policy reasons that cannot be adjusted via settings (reason: PROHIBITED_CONTENT). Try rephrasing the title/description to remove extreme, graphic, or otherwise sensitive details.';
  }
  if (blockReason) {
    return `Gemini blocked the response (reason: ${blockReason}). Try adjusting the description.`;
  }
  return 'Gemini returned no video analysis.';
}

// Uploads a file (audio narration or the source video) to Gemini's File API
// so the model can actually see/hear it, not just read a text description of
// it. Inline base64 media in generateContent is capped around 20MB per
// request, which both a multi-minute narration and any real video file can
// easily exceed, so this uses the resumable upload + file_uri reference flow
// instead, which is what Google's audio/video inputs are designed around.
async function uploadFileToGemini(
  file: File,
  apiKey: string,
  mimeType: string,
  maxWaitMs = 30_000,
  onWaiting?: (elapsedMs: number) => void
): Promise<GeminiFileRef> {
  const startResponse = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(file.size),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: file.name } }),
    }
  );
  if (!startResponse.ok) {
    throw new Error('Failed to start the file upload to Gemini.');
  }
  const uploadUrl = startResponse.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) {
    throw new Error('Gemini did not return an upload URL.');
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(file.size),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: file,
  });
  if (!uploadResponse.ok) {
    throw new Error('Failed to upload the file bytes to Gemini.');
  }

  let fileInfo = (await uploadResponse.json()).file as { uri?: string; name?: string; state?: string };
  if (!fileInfo?.uri || !fileInfo?.name) {
    throw new Error('Gemini upload response is missing the file URI.');
  }

  // Audio/video files go through a PROCESSING step before they can be
  // referenced in generateContent - poll until Gemini marks it ACTIVE.
  // Processing time scales with video length, not file size: a real
  // movie/episode routinely takes several minutes even well under the 2GB
  // cap, so this is budgeted by elapsed time rather than a small fixed
  // attempt count (a previous 90-second budget meant real videos almost
  // always timed out here and silently fell back to periodic sampling).
  const pollIntervalMs = 2000;
  const deadline = Date.now() + maxWaitMs;
  while (fileInfo.state === 'PROCESSING' && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    onWaiting?.(Date.now() - (deadline - maxWaitMs));
    const statusResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileInfo.name}?key=${apiKey}`
    );
    if (!statusResponse.ok) break;
    fileInfo = await statusResponse.json();
  }

  if (fileInfo.state !== 'ACTIVE' || !fileInfo.uri) {
    throw new Error('Gemini could not finish processing the file in time.');
  }

  return { uri: fileInfo.uri, mimeType };
}

function guessVideoMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mov': return 'video/mov';
    case 'avi': return 'video/avi';
    case 'mkv': return 'video/x-matroska';
    default: return 'video/mp4';
  }
}

interface VideoSegment {
  start: number
  end: number
}

// Gemini's File API caps individual files at 2GB - beyond that, skip video
// analysis entirely rather than waste time on an upload that will just fail.
const GEMINI_VIDEO_SIZE_CAP = 2 * 1024 * 1024 * 1024;

// Asks Gemini to actually watch the uploaded video and pick out the moments
// worth including in the recap, instead of FFmpeg blindly sampling evenly-
// spaced clips. Returns chronological, non-overlapping segments (in seconds)
// trimmed to roughly targetDurationSeconds total.
async function analyzeVideoSegmentsWithGemini(
  videoFileRef: GeminiFileRef,
  apiKey: string,
  targetDurationSeconds: number,
  videoDurationSeconds: number | undefined,
  description: string,
  // Actually watching/analyzing a long movie can itself take a long time to
  // respond (not just the earlier upload+processing step) - budget the same
  // 22 minutes here, with periodic elapsed-time feedback so a long wait
  // doesn't look frozen, and a clean timeout instead of hanging forever.
  maxWaitMs = 22 * 60 * 1000,
  onWaiting?: (elapsedMs: number) => void
): Promise<VideoSegment[]> {
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

  const prompt = `
    You are given a movie/TV episode video file. Watch it and select the most important, representative moments to include in a short recap.
    ${description ? `\n    Context about the content, provided by the user:\n    """\n    ${description}\n    """\n` : ''}
    Return a JSON array, and ONLY a JSON array with no other text and no markdown code fences, of the segments to include in the recap, in chronological order, using exactly this shape:
    [{"start": "HH:MM:SS", "end": "HH:MM:SS"}, ...]

    Rules:
    - Each segment must capture a genuinely important, representative moment (key plot beats, turning points, standout visuals or lines) - not arbitrary evenly-spaced clips.
    - Segments must be listed in chronological order and must not overlap.
    - Each segment should be roughly 1-4 seconds long.
    - The segments' combined total duration should add up to approximately ${targetDurationSeconds} seconds.
    - Use HH:MM:SS timestamps that fall within the actual video${videoDurationSeconds ? ` (it is about ${Math.round(videoDurationSeconds)} seconds long)` : ''}.
  `;

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), maxWaitMs);
  const intervalId = onWaiting ? setInterval(() => onWaiting(Date.now() - startTime), 2000) : undefined;

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { file_data: { mime_type: videoFileRef.mimeType, file_uri: videoFileRef.uri } },
            { text: prompt },
          ],
        }],
        safetySettings: GEMINI_SAFETY_SETTINGS,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error('Gemini video analysis timed out.');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
    if (intervalId) clearInterval(intervalId);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error?.message || 'Gemini video analysis request failed.');
  }

  const data = await response.json();
  const text: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(describeGeminiBlockReason(data.promptFeedback?.blockReason));
  }

  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const parsed = JSON.parse(cleaned) as Array<{ start: string; end: string }>;

  const toSeconds = (ts: string): number => {
    const parts = ts.split(':').map(Number);
    if (parts.some(Number.isNaN)) return NaN;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
  };

  const segments = parsed
    .map(({ start, end }) => ({ start: toSeconds(start), end: toSeconds(end) }))
    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .map(({ start, end }) => ({
      start: Math.max(0, start),
      end: videoDurationSeconds ? Math.min(end, videoDurationSeconds) : end,
    }))
    .filter(({ start, end }) => end > start)
    .sort((a, b) => a.start - b.start);

  if (segments.length === 0) {
    throw new Error('Gemini did not return any usable segments.');
  }

  // Keep segments in order until the running total would exceed the target,
  // then clip the final one so the total stays close to what was requested.
  const trimmed: VideoSegment[] = [];
  let total = 0;
  for (const seg of segments) {
    if (total >= targetDurationSeconds) break;
    const remaining = targetDurationSeconds - total;
    const segDuration = seg.end - seg.start;
    if (segDuration <= remaining) {
      trimmed.push(seg);
      total += segDuration;
    } else {
      trimmed.push({ start: seg.start, end: seg.start + remaining });
      total += remaining;
      break;
    }
  }

  return trimmed;
}

const HomePage = ({ apiKey }: HomePageProps) => {
  const { t } = useTranslation()
  const [selectedFile, setSelectedFile] = useState<VideoFile | null>(null)
  const [audioFile, setAudioFile] = useState<AudioFile | null>(null)
  const [settings, setSettings] = useState<RecapSettingsType>({
    duration: 30,
    intervalSeconds: 8,
    captureSeconds: 1,
    title: '',
    genre: '',
    description: '',
    apiKey: ''
  })
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatusType | null>(null)
  const [recapOutput, setRecapOutput] = useState<RecapOutput | null>(null)
  const ffmpegRef = useRef(new FFmpeg())

  // Attach ffmpeg listeners once - registering them inside handleCreateRecap
  // would stack a new duplicate listener on every recap created in the same session.
  useEffect(() => {
    const ffmpeg = ffmpegRef.current
    ffmpeg.on('log', ({ message }) => { console.log(message) })
    ffmpeg.on('progress', ({ progress }) => {
      if (progress >= 0 && progress <= 1) {
        setProcessingStatus(prev => prev ? {
          ...prev,
          stage: 'cutting_video',
          progress: Math.round(progress * 100),
          message: t('home.status.cutting', { percent: Math.round(progress * 100) })
        } : prev)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreateRecap = async () => {
    if (!selectedFile) {
      alert(t('home.alerts.selectFile'));
      return;
    }
    if (!apiKey) {
      alert(t('home.alerts.enterApiKey'));
      return;
    }
    if (!settings.title.trim()) {
      alert(t('home.alerts.enterTitle'));
      return;
    }
    if (!settings.description.trim()) {
      alert(t('home.alerts.enterDescription'));
      return;
    }
    if (!selectedFile.buffer) {
      alert(t('home.alerts.fileNotRead'));
      return;
    }

    setRecapOutput(null);
    setProcessingStatus({ stage: 'loading_engine', progress: 0, message: t('home.status.preparing') });
    const ffmpeg = ffmpegRef.current;

    try {
      setProcessingStatus({
        stage: 'loading_engine',
        progress: 0,
        message: t('home.status.loadingEngine')
      });

      if (!ffmpeg.loaded) {
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
      }

      // Before any cutting happens, let Gemini actually watch the source
      // video and pick out the moments worth keeping, instead of FFmpeg
      // blindly sampling evenly-spaced clips. Non-fatal at every step - if
      // the file is over Gemini's per-file cap, or the upload/analysis
      // fails for any reason, this silently falls back to the original
      // periodic sampling further down.
      let videoFileRef: GeminiFileRef | undefined;
      let smartSegments: VideoSegment[] | undefined;
      if (selectedFile.file.size <= GEMINI_VIDEO_SIZE_CAP) {
        setProcessingStatus({
          stage: 'analyzing_video',
          progress: 0,
          message: t('home.status.uploadingVideoForGemini')
        });
        try {
          // Real movies/episodes can take several minutes for Gemini to finish
          // processing server-side, well beyond typical upload time - budget
          // up to 22 minutes and keep the status message moving so it doesn't
          // look frozen during the wait.
          videoFileRef = await uploadFileToGemini(
            selectedFile.file,
            apiKey,
            guessVideoMimeType(selectedFile.name),
            22 * 60 * 1000,
            (elapsedMs) => {
              const totalSeconds = Math.round(elapsedMs / 1000);
              const minutes = Math.floor(totalSeconds / 60);
              const seconds = totalSeconds % 60;
              setProcessingStatus({
                stage: 'analyzing_video',
                progress: 30,
                message: t('home.status.uploadingVideoForGeminiElapsed', {
                  time: `${minutes}:${seconds.toString().padStart(2, '0')}`
                })
              });
            }
          );
          setProcessingStatus({
            stage: 'analyzing_video',
            progress: 60,
            message: t('home.status.analyzingVideo')
          });
          smartSegments = await analyzeVideoSegmentsWithGemini(
            videoFileRef,
            apiKey,
            settings.duration,
            selectedFile.duration,
            settings.description,
            22 * 60 * 1000,
            (elapsedMs) => {
              const totalSeconds = Math.round(elapsedMs / 1000);
              const minutes = Math.floor(totalSeconds / 60);
              const seconds = totalSeconds % 60;
              setProcessingStatus({
                stage: 'analyzing_video',
                progress: 60,
                message: t('home.status.analyzingVideoElapsed', {
                  time: `${minutes}:${seconds.toString().padStart(2, '0')}`
                })
              });
            }
          );
        } catch (e) {
          console.warn('Gemini video analysis failed, falling back to standard periodic sampling', e);
          smartSegments = undefined;
        }
      } else {
        console.warn('Video is over Gemini\'s 2GB per-file limit - skipping video analysis, using standard periodic sampling.');
      }

      setProcessingStatus({
        stage: 'cutting_video',
        progress: 0,
        message: t('home.status.writingFile')
      });
      // Use the pre-buffered bytes captured at file-selection time.
      // Never read from the stale File object here — the browser may have
      // revoked read permission after user interactions (NotReadableError).
      if (!selectedFile.buffer) {
        throw new Error(t('home.alerts.fileNotRead'));
      }
      await ffmpeg.writeFile(selectedFile.name, selectedFile.buffer);
      if (audioFile) {
        await ffmpeg.writeFile(audioFile.name, audioFile.buffer);
      }

      const outputFileName = 'recap.mp4';
      // When Gemini picked out meaningful segments, cut exactly those instead
      // of the periodic "every N seconds" fallback.
      const selectFilter = smartSegments && smartSegments.length > 0
        ? `select='${smartSegments.map(s => `between(t,${s.start.toFixed(2)},${s.end.toFixed(2)})`).join('+')}',setpts=N/FRAME_RATE/TB`
        : `select='lt(mod(t,${settings.intervalSeconds}),${settings.captureSeconds})',setpts=N/FRAME_RATE/TB`;
      // Cap resolution and use a fast x264 preset - recap clips don't need full
      // source resolution or the default "medium" preset's quality, and both cuts
      // are large speed wins for a software encoder running in-browser.
      // When the user supplied their own MP3 narration, mux it in as the second
      // input's audio stream instead of leaving the recap silent (-an).
      await ffmpeg.exec([
        '-i', selectedFile.name,
        ...(audioFile ? ['-i', audioFile.name] : []),
        '-vf', `${selectFilter},scale='min(1280,iw)':-2`,
        ...(audioFile ? ['-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k'] : ['-an']),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '26',
        '-movflags', '+faststart',
        '-t', `${settings.duration}`,
        ...(audioFile ? ['-shortest'] : []),
        '-y',
        outputFileName
      ]);

      const data = await ffmpeg.readFile(outputFileName);
      const videoBlob = new Blob([data as unknown as BlobPart], { type: 'video/mp4' });
      const videoUrl = URL.createObjectURL(videoBlob);

      setProcessingStatus({
        stage: 'completed',
        progress: 100,
        message: t('home.status.completed')
      });

      setRecapOutput({
        videoUrl: videoUrl,
        videoBlob: videoBlob,
        durationSeconds: settings.duration,
        customAudioFile: audioFile?.file,
        // watchedVideo tracks whether Gemini actually received/looked at the
        // video (the upload succeeded), independent of whether its analysis
        // then produced usable segments - it can watch and still fail to
        // return anything the cuts could be based on (bad/empty JSON, no
        // segments after filtering, etc).
        watchedVideo: !!videoFileRef,
        usedSmartSelection: !!(smartSegments && smartSegments.length > 0),
      });

      // Increment the shared, global counter in Supabase
      await incrementRecapsCreated();

      await ffmpeg.deleteFile(selectedFile.name);
      if (audioFile) {
        await ffmpeg.deleteFile(audioFile.name);
      }
      await ffmpeg.deleteFile(outputFileName);

    } catch (error: unknown) {
      console.error("An error occurred during recap creation:", error);
      let userMessage = t('home.errors.unknown');
      if (error instanceof Error) {
        if (error.message.includes('overloaded')) {
          userMessage = t('home.errors.overloaded');
        } else if (error.message.includes('API key')) {
          userMessage = t('home.errors.invalidKey');
        } else if (error.message.includes('FFmpeg')) {
          userMessage = t('home.errors.ffmpeg');
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
    { icon: Zap, title: t('home.features.fastTitle'), description: t('home.features.fastDesc') },
    { icon: Cpu, title: t('home.features.ffmpegTitle'), description: t('home.features.ffmpegDesc') },
    { icon: Shield, title: t('home.features.secureTitle'), description: t('home.features.secureDesc') },
    { icon: Users, title: t('home.features.easyTitle'), description: t('home.features.easyDesc') }
  ]

  const isProcessing = !!(processingStatus && processingStatus.stage !== 'completed' && processingStatus.stage !== 'error');
  const canSubmit = !!selectedFile && !!apiKey && !!settings.title.trim() && !!settings.description.trim() && !isProcessing;

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
        className="glass rounded-lg p-8 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <h3 className="text-2xl font-bold text-white mb-6">
          {t('home.welcome.title')}
        </h3>
        <ol className="text-right text-gray-300 space-y-4 max-w-md mx-auto">
          <li className="flex items-start">
            <span className="bg-blue-600 text-white rounded-full h-8 w-8 flex items-center justify-center ml-4 flex-shrink-0 text-lg font-bold">1</span>
            <div>
              <span className="font-semibold text-white">{t('home.welcome.step1Title')}</span> {t('home.welcome.step1Desc')}
            </div>
          </li>
          <li className="flex items-start">
            <span className="bg-blue-600 text-white rounded-full h-8 w-8 flex items-center justify-center ml-4 flex-shrink-0 text-lg font-bold">2</span>
            <div>
              <span className="font-semibold text-white">{t('home.welcome.step2Title')}</span> {t('home.welcome.step2Desc')}
            </div>
          </li>
          <li className="flex items-start">
            <span className="bg-blue-600 text-white rounded-full h-8 w-8 flex items-center justify-center ml-4 flex-shrink-0 text-lg font-bold">3</span>
            <div>
              <span className="font-semibold text-white">{t('home.welcome.step3Title')}</span> {t('home.welcome.step3Desc')}
            </div>
          </li>
        </ol>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen text-white">
      <section className="py-20 text-center">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
            {t('home.title')}
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
            {t('home.subtitle')}
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
            <AudioUploader
              selectedFile={audioFile}
              onFileSelect={setAudioFile}
              onRemoveFile={() => setAudioFile(null)}
            />
            <RecapSettings settings={settings} onSettingsChange={setSettings} videoDuration={selectedFile?.duration} />
            <motion.button
              onClick={handleCreateRecap}
              disabled={!canSubmit}
              className={`w-full py-4 px-6 rounded-lg font-semibold text-lg transition-all ${
                canSubmit
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white'
                  : 'bg-white/5 text-gray-400 cursor-not-allowed'
              }`}
              whileHover={{ scale: canSubmit ? 1.02 : 1 }}
              whileTap={{ scale: canSubmit ? 0.98 : 1 }}
            >
              <Play className="inline-block h-5 w-5 ml-2" />
              {isProcessing ? t('home.processingButton') : t('home.createButton')}
            </motion.button>
          </div>

          <div className="space-y-6">
            {renderRightPanel()}

            <div className="grid grid-cols-2 gap-4">
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  className="glass rounded-lg p-4 text-center"
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
