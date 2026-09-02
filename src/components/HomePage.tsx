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
import FullVideoSummary from './FullVideoSummary'
import type { VideoFile, AudioFile, RecapSettings as RecapSettingsType, ProcessingStatus as ProcessingStatusType, RecapOutput, GeminiFileRef } from '../types'
import { GEMINI_SAFETY_SETTINGS, describeGeminiBlockReason, describeFailedResponse, fetchGeminiWithRetry, uploadFileToGemini, guessVideoMimeType, isGeminiSupportedVideoFormat, deleteGeminiFile, GEMINI_VIDEO_SIZE_CAP } from '../lib/gemini'

interface HomePageProps {
  apiKey: string
}

interface VideoSegment {
  start: number
  end: number
}

// Safe default "cut every N seconds, capture M seconds" pattern - short,
// widely-spaced flashes of the source are meaningfully safer with respect
// to copyright than longer/denser clips.
const SAFE_MIN_INTERVAL_SECONDS = 8;
const SAFE_MIN_CAPTURE_SECONDS = 1;

// Governs how closely-spaced and how long Gemini's smart-selected clips are
// allowed to be. Honors the user's own chosen "cut every N seconds" interval
// (and matching capture length) only when it's at least as sparse as the
// safe default above - a denser choice (cutting more often than every 8
// seconds) is silently overridden back to that default instead, since a
// user preference for denser/more continuous clips isn't a good enough
// reason to accept the extra copyright risk that comes with it.
function getEffectiveCutPattern(settings: RecapSettingsType): { intervalSeconds: number; captureSeconds: number } {
  if (settings.intervalSeconds >= SAFE_MIN_INTERVAL_SECONDS) {
    return { intervalSeconds: settings.intervalSeconds, captureSeconds: settings.captureSeconds };
  }
  return { intervalSeconds: SAFE_MIN_INTERVAL_SECONDS, captureSeconds: SAFE_MIN_CAPTURE_SECONDS };
}

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
  // Hard cap on each individual clip's length, in seconds, and the minimum
  // spacing enforced between consecutive picked clips' start times - both
  // derived from RecapSettings.captureSeconds/intervalSeconds (see
  // getEffectiveCutPattern below): the user's own chosen values are honored
  // when they're at least as sparse as the safe "8 seconds apart, 1 second
  // each" default, otherwise that default is enforced instead regardless of
  // what was configured. Brief, widely-spaced flashes of the source rather
  // than longer/denser continuous clips are a lot safer with respect to
  // copyright, no matter how "important" Gemini thinks a moment is - so both
  // values are enforced below by trimming/filtering, not just requested in
  // the prompt; Gemini's actual reply is not trusted to respect them alone.
  maxClipSeconds: number,
  minSpacingSeconds: number,
  // Actually watching/analyzing a long movie can itself take a long time to
  // respond (not just the earlier upload+processing step) - budget the same
  // 22 minutes here, with periodic elapsed-time feedback so a long wait
  // doesn't look frozen, and a clean timeout instead of hanging forever.
  maxWaitMs = 22 * 60 * 1000,
  onWaiting?: (elapsedMs: number) => void
): Promise<VideoSegment[]> {
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${apiKey}`;

  const prompt = `
    You are given a movie/TV episode video file. Watch it and select the most important, representative moments to include in a short recap.
    ${description ? `\n    Context about the content, provided by the user:\n    """\n    ${description}\n    """\n` : ''}
    Return a JSON array, and ONLY a JSON array with no other text and no markdown code fences, of the segments to include in the recap, using exactly this shape:
    [{"start": "HH:MM:SS", "end": "HH:MM:SS"}, ...]

    Rules:
    - Each segment must capture a genuinely important, representative moment (key plot beats, turning points, standout visuals or lines) - not arbitrary evenly-spaced clips.
    - You do NOT need to scan the video strictly forward or list segments in the order they appear - freely go back to an earlier part of the video if it turns out to matter, even after you've already picked something from later on. Pick whichever moments are the most important, wherever they fall - the app sorts them into chronological order automatically afterward.
    - Segments must not overlap with each other.
    - Each segment must be at most ${maxClipSeconds} second${maxClipSeconds === 1 ? '' : 's'} long - brief flashes of the moment, not longer continuous clips.
    - Any two segments must start at least ${minSpacingSeconds} seconds apart from each other, regardless of the order you list them in.
    - The segments' combined total duration should add up to approximately ${targetDurationSeconds} seconds.
    - Use HH:MM:SS timestamps that fall within the actual video${videoDurationSeconds ? ` (it is about ${Math.round(videoDurationSeconds)} seconds long)` : ''}.
  `;

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), maxWaitMs);
  const intervalId = onWaiting ? setInterval(() => onWaiting(Date.now() - startTime), 2000) : undefined;

  let response: Response;
  try {
    response = await fetchGeminiWithRetry(API_URL, {
      contents: [{
        parts: [
          { file_data: { mime_type: videoFileRef.mimeType, file_uri: videoFileRef.uri } },
          { text: prompt },
        ],
      }],
      safetySettings: GEMINI_SAFETY_SETTINGS,
    }, controller.signal);
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
    throw new Error(`Gemini video analysis request failed: ${await describeFailedResponse(response)}`);
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
    .map(({ start, end }) => {
      const clampedStart = Math.max(0, start);
      return {
        start: clampedStart,
        // Hard-capped to maxClipSeconds regardless of what Gemini returned -
        // the prompt asks for this too, but it's not trusted to comply on
        // its own; this is the actual, non-negotiable enforcement.
        end: Math.min(
          clampedStart + maxClipSeconds,
          videoDurationSeconds ? Math.min(end, videoDurationSeconds) : end
        ),
      };
    })
    .filter(({ start, end }) => end > start)
    // Gemini is explicitly told it's free to pick segments in any order (see
    // the prompt above) - it can revisit an earlier part of the video after
    // already picking something later on, instead of only scanning forward.
    // This sort is what actually puts them back into chronological order for
    // playback, regardless of what order Gemini returned them in.
    .sort((a, b) => a.start - b.start)
    // Enforced the same way as the length cap above - drop any segment that
    // starts too soon after the previous kept one (now guaranteed adjacent in
    // time thanks to the sort above), regardless of what Gemini returned,
    // instead of just asking for it in the prompt.
    .reduce<VideoSegment[]>((kept, seg) => {
      const previous = kept[kept.length - 1];
      if (!previous || seg.start - previous.start >= minSpacingSeconds) {
        kept.push(seg);
      }
      return kept;
    }, []);

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
    apiKey: '',
    keepOriginalAudio: false
  })
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatusType | null>(null)
  const [recapOutput, setRecapOutput] = useState<RecapOutput | null>(null)
  const ffmpegRef = useRef(new FFmpeg())

  // Deletes the previous recap's uploaded video from Gemini whenever it's
  // replaced (a new recap created in the same session) or this component
  // unmounts - every upload counts against a shared, cumulative storage
  // quota until deleted, so leaving these around silently fills it up.
  useEffect(() => {
    const ref = recapOutput?.geminiVideoFileRef
    return () => {
      if (ref) {
        deleteGeminiFile(ref.name, apiKey)
      }
    }
  }, [recapOutput?.geminiVideoFileRef, apiKey])

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
    // Hoisted above the try block so the catch block below can clean this up
    // from Gemini if cutting/anything after the upload fails - otherwise a
    // recap that fails partway through would leave an orphaned upload that
    // never gets deleted (setRecapOutput, which the cleanup effect watches,
    // is never reached on this path).
    let videoFileRef: GeminiFileRef | undefined;
    // When the user supplied their own MP3 narration, the recap is always
    // made to match that narration's actual length exactly, instead of the
    // separately-configured duration setting - otherwise the narration would
    // get cut off mid-sentence (audio longer than the setting) or the video
    // would run on in silence after it ends (audio shorter than the
    // setting). Falls back to settings.duration when there's no audio, or
    // its duration couldn't be read from metadata.
    const effectiveDuration = audioFile?.duration ?? settings.duration;

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
      let smartSegments: VideoSegment[] | undefined;
      if (selectedFile.file.size <= GEMINI_VIDEO_SIZE_CAP && isGeminiSupportedVideoFormat(selectedFile.name)) {
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
          const cutPattern = getEffectiveCutPattern(settings);
          smartSegments = await analyzeVideoSegmentsWithGemini(
            videoFileRef,
            apiKey,
            effectiveDuration,
            selectedFile.duration,
            settings.description,
            cutPattern.captureSeconds,
            cutPattern.intervalSeconds,
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
        console.warn(
          selectedFile.file.size > GEMINI_VIDEO_SIZE_CAP
            ? 'Video is over Gemini\'s 2GB per-file limit - skipping video analysis, using standard periodic sampling.'
            : 'MKV is not a Gemini-supported video format - skipping video analysis, using standard periodic sampling.'
        );
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
      // of the periodic "every N seconds" fallback. Kept as a bare predicate
      // (not yet wrapped in select=/aselect=) so the identical timing logic
      // can drive both the video and, when keepOriginalAudio is on, a
      // synced audio select filter below - a clip and its own original sound
      // have to be picked using the exact same time windows.
      const selectPredicate = smartSegments && smartSegments.length > 0
        ? smartSegments.map(s => `between(t,${s.start.toFixed(2)},${s.end.toFixed(2)})`).join('+')
        : `lt(mod(t,${settings.intervalSeconds}),${settings.captureSeconds})`;
      // Cap resolution and use a fast x264 preset - recap clips don't need full
      // source resolution or the default "medium" preset's quality, and both cuts
      // are large speed wins for a software encoder running in-browser.
      // Three audio modes: a user-supplied MP3 narration (muxed in as the
      // second input's audio stream) takes priority; otherwise, if the user
      // asked to keep the movie/show's own original sound, the source
      // video's own audio track is cut with the exact same select predicate
      // as the video (so dialogue/sound stays in sync with the picked
      // clips); otherwise the recap stays silent (-an), same as before this
      // option existed.
      const useOriginalAudio = !audioFile && settings.keepOriginalAudio;
      // Deliberately no -shortest here: the selected/cut video footage can add
      // up to less than effectiveDuration (e.g. the safe copyright cap on clip
      // length/spacing limits how much footage is even available to select),
      // and -shortest would then end the whole output as soon as that shorter
      // video stream runs out - cutting the narration off mid-sentence even
      // though -t already caps the output to the narration's own full length.
      // Letting the video stream end early (it simply stops appending frames;
      // players commonly hold the last frame) is far better than truncating
      // audio the user explicitly uploaded to be heard in full.
      await ffmpeg.exec([
        '-i', selectedFile.name,
        ...(audioFile ? ['-i', audioFile.name] : []),
        '-vf', `select='${selectPredicate}',setpts=N/FRAME_RATE/TB,scale='min(1280,iw)':-2`,
        ...(useOriginalAudio ? ['-af', `aselect='${selectPredicate}',asetpts=N/SR/TB`] : []),
        ...(audioFile
          ? ['-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k']
          : useOriginalAudio
          ? ['-map', '0:v', '-map', '0:a', '-c:a', 'aac', '-b:a', '192k']
          : ['-an']),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '26',
        '-movflags', '+faststart',
        '-t', `${effectiveDuration}`,
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
        durationSeconds: effectiveDuration,
        customAudioFile: audioFile?.file,
        // watchedVideo tracks whether Gemini actually received/looked at the
        // video (the upload succeeded), independent of whether its analysis
        // then produced usable segments - it can watch and still fail to
        // return anything the cuts could be based on (bad/empty JSON, no
        // segments after filtering, etc).
        watchedVideo: !!videoFileRef,
        usedSmartSelection: !!(smartSegments && smartSegments.length > 0),
        geminiVideoFileRef: videoFileRef,
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
      // The video may have already been uploaded to Gemini before whatever
      // failed - clean it up here too, since setRecapOutput (which the
      // cleanup effect above watches) is never reached on this path.
      if (videoFileRef) {
        deleteGeminiFile(videoFileRef.name, apiKey);
      }
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
      return <ResultsSection output={recapOutput} apiKey={apiKey} />;
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
            {selectedFile && (
              <FullVideoSummary
                selectedFile={selectedFile}
                apiKey={apiKey}
                description={settings.description}
              />
            )}
            <AudioUploader
              selectedFile={audioFile}
              onFileSelect={setAudioFile}
              onRemoveFile={() => setAudioFile(null)}
              keepOriginalAudio={settings.keepOriginalAudio}
              onKeepOriginalAudioChange={(value) => setSettings({ ...settings, keepOriginalAudio: value })}
            />
            <RecapSettings settings={settings} onSettingsChange={setSettings} videoDuration={selectedFile?.duration} audioDuration={audioFile?.duration} />
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
