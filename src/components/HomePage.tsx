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
import { localStorageService } from '../lib/localStorage'
import { recapStorageService } from '../lib/recapStorage'
import { getLatestTuningJob } from '../lib/geminiTuning'
import type { RecapRecord } from '../lib/blink'
import type { VideoFile, AudioFile, RecapSettings as RecapSettingsType, ProcessingStatus as ProcessingStatusType, RecapOutput } from '../types'

interface HomePageProps {
  apiKey: string
}

// Human-readable name sent to Gemini so the generated script/search results
// come back in the same language the UI is currently showing.
const scriptLanguageNames: Record<string, string> = {
  en: 'English',
  he: 'Hebrew',
  es: 'Spanish',
  fr: 'French',
}

interface GeminiFileRef {
  uri: string
  mimeType: string
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
  maxPollAttempts = 20
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

  // Audio/video files go through a PROCESSING step (longer for video) before
  // they can be referenced in generateContent - poll until Gemini marks it ACTIVE.
  for (let attempt = 0; attempt < maxPollAttempts && fileInfo.state === 'PROCESSING'; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1500));
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
  description: string
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

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { file_data: { mime_type: videoFileRef.mimeType, file_uri: videoFileRef.uri } },
          { text: prompt },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error?.message || 'Gemini video analysis request failed.');
  }

  const data = await response.json();
  const text: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini returned no video analysis.');
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

async function generateScriptWithGemini(
  settings: RecapSettingsType,
  apiKey: string,
  scriptLanguage: string,
  webSearchResults?: string,
  fileRefs?: GeminiFileRef[],
  goodExamples?: RecapRecord[],
  // A personally fine-tuned model (e.g. "tunedModels/xxx" - see
  // src/lib/geminiTuning.ts), used instead of the base model when the user
  // has one ready. Only used when there are no file attachments, since the
  // tuned model comes from a text-only training pipeline and isn't expected
  // to support multimodal file_data parts.
  tunedModelName?: string
): Promise<string> {
  const modelName = (tunedModelName && !fileRefs?.length) ? tunedModelName : 'models/gemini-3.6-flash';
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`;

  let contextInfo = '';
  if (webSearchResults) {
    contextInfo += `\n\nWeb Search Results:\n${webSearchResults}`;
  }

  const genreText = settings.genre ? ` (Genre: ${settings.genre})` : '';
  const youtubeContext = settings.youtubeLink
    ? `\n\nThe style should be similar to this ${settings.linkType === 'channel' ? 'channel' : 'video'}'s recaps: ${settings.youtubeLink}`
    : '';
  const hasVideo = fileRefs?.some(f => f.mimeType.startsWith('video/'));
  const hasAudio = fileRefs?.some(f => f.mimeType.startsWith('audio/'));
  const attachedSources = [hasVideo && 'the source video', hasAudio && 'an audio narration file'].filter(Boolean).join(' and ');
  const attachmentsContext = attachedSources
    ? `\n\nYou have also been given ${attachedSources} - use what you actually see/hear in them (visuals, dialogue, names, specific details, tone) as an additional, highly reliable source alongside the description below.`
    : '';

  // Few-shot examples pulled from this same user's own "up"-rated past
  // recaps (see recapStorageService.getGoodExamples) - a lightweight way for
  // the app to actually improve from real usage over time without needing
  // to fine-tune or retrain Gemini itself.
  const examplesContext = goodExamples && goodExamples.length > 0
    ? `\n\nHere are examples of scripts that worked well for this user's past recaps - match their tone, pacing, and style where it fits:\n${goodExamples.map((ex, i) => `\n    Example ${i + 1} (Title: ${ex.title}${ex.genre ? `, Genre: ${ex.genre}` : ''}):\n    """\n    ${ex.scriptText}\n    """`).join('\n')}`
    : '';

  const prompt = `
    You are a professional video scriptwriter creating voice-over scripts for movie/TV show recaps in ${scriptLanguage}.

    Title: ${settings.title}${genreText}${youtubeContext}${contextInfo}${attachmentsContext}${examplesContext}

    User-provided description (this is the primary and most important source - rely on it much more heavily than you normally would as a scriptwriter):
    """
    ${settings.description}
    """

    Create an engaging, cinematic voice-over script in ${scriptLanguage} for a video recap.
    The script should be:
    - Grounded almost entirely in the user-provided description above${attachedSources ? ` and the attached ${attachedSources}` : ''} - stick closely to their wording, facts, and details, and rely on them far more than on general or prior knowledge about the title
    - Do not invent plot points, characters, or events that are not in the description${attachedSources ? ' or attachments' : ''} and do not contradict them
    - Only use general knowledge to fill in minor gaps that source doesn't cover, and keep that to a minimum
    - Exciting and dramatic
    - Concise (3-4 sentences, matching the video duration of ${settings.duration} seconds)
    - In natural, fluent ${scriptLanguage}
    - Capture the essence and key moments described above
    ${settings.youtubeLink ? '- Match the style and tone of the reference YouTube content' : ''}

    Return ONLY the ${scriptLanguage} script text, no additional commentary.
  `;

  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  for (const ref of fileRefs || []) {
    parts.push({ file_data: { mime_type: ref.mimeType, file_uri: ref.uri } });
  }

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
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
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

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
  const { t, i18n } = useTranslation()
  const [selectedFile, setSelectedFile] = useState<VideoFile | null>(null)
  const [audioFile, setAudioFile] = useState<AudioFile | null>(null)
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
          videoFileRef = await uploadFileToGemini(selectedFile.file, apiKey, guessVideoMimeType(selectedFile.name), 60);
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
            settings.description
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
      const videoUrl = URL.createObjectURL(new Blob([data as unknown as BlobPart], { type: 'video/mp4' }));

      setProcessingStatus({
        stage: 'generating_script',
        progress: 0,
        message: t('home.status.generatingScript')
      });

      // Perform web search if enabled
      let webSearchResults = '';
      if (settings.webSearch) {
        setProcessingStatus({
          stage: 'generating_script',
          progress: 30,
          message: t('home.status.searchingWeb')
        });
        webSearchResults = await searchWebForMovieInfo(settings.title, settings.genre, apiKey);
      }

      // If the user attached a narration MP3, upload it to Gemini's File API
      // so the model actually listens to it instead of only reading text
      // about it - non-fatal if it fails, the script still generates from
      // the description (and the audio is still muxed into the video either way).
      let audioFileRef: GeminiFileRef | undefined;
      if (audioFile) {
        setProcessingStatus({
          stage: 'generating_script',
          progress: 45,
          message: t('home.status.analyzingAudio')
        });
        try {
          audioFileRef = await uploadFileToGemini(audioFile.file, apiKey, audioFile.file.type || 'audio/mpeg');
        } catch (e) {
          console.warn('Uploading narration audio to Gemini failed, generating script from text only', e);
        }
      }

      setProcessingStatus({
        stage: 'generating_script',
        progress: settings.webSearch ? 60 : 50,
        message: t('home.status.generatingCustomScript')
      });
      const scriptLanguage = scriptLanguageNames[i18n.resolvedLanguage || 'en'] || 'English';
      // Reuse the same video file already uploaded for segment analysis (if
      // that succeeded) rather than uploading it to Gemini a second time.
      const scriptFileRefs = [videoFileRef, audioFileRef].filter((ref): ref is GeminiFileRef => !!ref);
      const goodExamples = await recapStorageService.getGoodExamples(settings.genre);
      // Non-fatal: if a personally fine-tuned model exists and is ready, use
      // it; any failure here (not signed in, no job yet, network hiccup)
      // just means generateScriptWithGemini falls back to the base model.
      let tunedModelName: string | undefined;
      try {
        const tuningJob = await getLatestTuningJob();
        if (tuningJob?.status === 'ready' && tuningJob.tunedModelName) {
          tunedModelName = tuningJob.tunedModelName;
        }
      } catch (e) {
        console.warn('Could not check for a personalized tuned model, using the base model', e);
      }
      const generatedScript = await generateScriptWithGemini(settings, apiKey, scriptLanguage, webSearchResults, scriptFileRefs, goodExamples, tunedModelName);

      setProcessingStatus({
        stage: 'generating_script',
        progress: 100,
        message: t('home.status.scriptDone')
      });
      await new Promise(resolve => setTimeout(resolve, 500));

      setProcessingStatus({
        stage: 'generating_audio',
        progress: 50,
        message: t('home.status.preparingAudio')
      });
      await new Promise(resolve => setTimeout(resolve, 1000));

      setProcessingStatus({
        stage: 'completed',
        progress: 100,
        message: t('home.status.completed')
      });

      setRecapOutput({
        videoUrl: videoUrl,
        script: generatedScript,
        customAudioFile: audioFile?.file,
        usedSmartSelection: !!(smartSegments && smartSegments.length > 0),
      });

      // Increment the counter locally
      await localStorageService.incrementRecapsCreated();

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
