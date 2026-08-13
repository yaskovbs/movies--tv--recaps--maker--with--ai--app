// Desktop renderer - mirrors the logic in the website's src/components/HomePage.tsx
// (same Gemini prompt, same FFmpeg filter graph) but drives it through the
// native FFmpeg binary exposed by the main process instead of ffmpeg.wasm.

const state = {
  selectedFile: null, // { path, name, size }
  videoDuration: 0,
  outputPath: null,
}

const el = {
  apiKey: document.getElementById('apiKey'),
  selectVideoBtn: document.getElementById('selectVideoBtn'),
  videoInfo: document.getElementById('videoInfo'),
  videoName: document.getElementById('videoName'),
  videoDuration: document.getElementById('videoDuration'),
  title: document.getElementById('title'),
  genre: document.getElementById('genre'),
  description: document.getElementById('description'),
  scriptLanguage: document.getElementById('scriptLanguage'),
  duration: document.getElementById('duration'),
  captureSeconds: document.getElementById('captureSeconds'),
  intervalSeconds: document.getElementById('intervalSeconds'),
  intervalInfo: document.getElementById('intervalInfo'),
  createBtn: document.getElementById('createBtn'),
  progressArea: document.getElementById('progressArea'),
  progressMessage: document.getElementById('progressMessage'),
  progressFill: document.getElementById('progressFill'),
  errorArea: document.getElementById('errorArea'),
  resultArea: document.getElementById('resultArea'),
  resultVideo: document.getElementById('resultVideo'),
  saveVideoBtn: document.getElementById('saveVideoBtn'),
  copyScriptBtn: document.getElementById('copyScriptBtn'),
  scriptOutput: document.getElementById('scriptOutput'),
  welcomeArea: document.getElementById('welcomeArea'),
}

function formatDuration(totalSecondsRaw) {
  const totalSeconds = Math.round(totalSecondsRaw)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function updateCanSubmit() {
  const canSubmit =
    !!state.selectedFile &&
    !!el.apiKey.value.trim() &&
    !!el.title.value.trim() &&
    !!el.description.value.trim()
  el.createBtn.disabled = !canSubmit
}

function recalcInterval() {
  const duration = Number(el.duration.value) || 30
  const captureSeconds = Number(el.captureSeconds.value) || 1

  if (state.videoDuration > 0) {
    const computed = Math.max(captureSeconds, Math.round((state.videoDuration * captureSeconds) / duration))
    el.intervalSeconds.value = computed
    const segments = Math.floor(state.videoDuration / computed)
    el.intervalInfo.textContent = `Video is ${formatDuration(state.videoDuration)} long - cutting every ${computed}s yields about ${segments} segment(s) across the full video.`
  } else {
    el.intervalInfo.textContent = ''
  }
}

;['input', 'change'].forEach((evt) => {
  el.duration.addEventListener(evt, recalcInterval)
  el.captureSeconds.addEventListener(evt, recalcInterval)
})
;[el.apiKey, el.title, el.description].forEach((input) => {
  input.addEventListener('input', updateCanSubmit)
})

el.selectVideoBtn.addEventListener('click', async () => {
  const file = await window.desktopApi.selectVideo()
  if (!file) return
  state.selectedFile = file
  el.videoName.textContent = file.name
  el.videoInfo.classList.remove('hidden')
  el.videoDuration.textContent = 'Reading duration...'
  try {
    const duration = await window.desktopApi.getVideoDuration(file.path)
    state.videoDuration = duration
    el.videoDuration.textContent = formatDuration(duration)
    recalcInterval()
  } catch (err) {
    el.videoDuration.textContent = 'Unknown'
  }
  updateCanSubmit()
})

function setProgress(message, percent) {
  el.welcomeArea.classList.add('hidden')
  el.resultArea.classList.add('hidden')
  el.errorArea.classList.add('hidden')
  el.progressArea.classList.remove('hidden')
  el.progressMessage.textContent = message
  el.progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`
}

function showError(message) {
  el.progressArea.classList.add('hidden')
  el.resultArea.classList.add('hidden')
  el.welcomeArea.classList.add('hidden')
  el.errorArea.classList.remove('hidden')
  el.errorArea.textContent = message
}

function showResult(videoPath, script) {
  el.progressArea.classList.add('hidden')
  el.errorArea.classList.add('hidden')
  el.welcomeArea.classList.add('hidden')
  el.resultArea.classList.remove('hidden')
  el.resultVideo.src = `file://${videoPath}`
  el.scriptOutput.value = script
}

async function generateScriptWithGemini(apiKey, scriptLanguage, webSearchResults) {
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`

  const title = el.title.value.trim()
  const genre = el.genre.value
  const description = el.description.value.trim()
  const duration = Number(el.duration.value) || 30

  let contextInfo = ''
  if (webSearchResults) {
    contextInfo += `\n\nWeb Search Results:\n${webSearchResults}`
  }
  const genreText = genre ? ` (Genre: ${genre})` : ''

  const prompt = `
    You are a professional video scriptwriter creating voice-over scripts for movie/TV show recaps in ${scriptLanguage}.

    Title: ${title}${genreText}${contextInfo}

    User-provided description (this is the primary and most important source - rely on it much more heavily than you normally would as a scriptwriter):
    """
    ${description}
    """

    Create an engaging, cinematic voice-over script in ${scriptLanguage} for a video recap.
    The script should be:
    - Grounded almost entirely in the user-provided description above - stick closely to its wording, facts, and details, and rely on it far more than on general or prior knowledge about the title
    - Do not invent plot points, characters, or events that are not in the description and do not contradict it
    - Only use general knowledge to fill in minor gaps the description does not cover, and keep that to a minimum
    - Exciting and dramatic
    - Concise (3-4 sentences, matching the video duration of ${duration} seconds)
    - In natural, fluent ${scriptLanguage}
    - Capture the essence and key moments described above

    Return ONLY the ${scriptLanguage} script text, no additional commentary.
  `

  const maxRetries = 3
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    })

    if (response.status === 503) {
      if (attempt === maxRetries) break
      const delay = Math.pow(2, attempt) * 1000
      await new Promise((resolve) => setTimeout(resolve, delay))
      continue
    }

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error?.message || 'An unknown API error occurred.')
    }

    const data = await response.json()
    const script = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!script) {
      const blockReason = data.promptFeedback?.blockReason
      throw new Error(
        blockReason
          ? `Gemini blocked the response (reason: ${blockReason}). Try adjusting the description.`
          : 'Failed to extract script from API response.'
      )
    }
    return script.trim()
  }

  throw new Error('The model is currently overloaded. Please try again in a few moments.')
}

el.createBtn.addEventListener('click', async () => {
  if (!state.selectedFile) return
  const apiKey = el.apiKey.value.trim()
  if (!apiKey) return

  el.createBtn.disabled = true
  try {
    setProgress('Preparing output file...', 0)
    const outputPath = await window.desktopApi.getTempPath(`recap-${Date.now()}.mp4`)

    const unsubscribe = window.desktopApi.onProgress((progress) => {
      setProgress(`Cutting video with FFmpeg... ${Math.round(progress * 100)}%`, progress * 90)
    })

    setProgress('Cutting video with FFmpeg...', 0)
    await window.desktopApi.createRecap({
      inputPath: state.selectedFile.path,
      outputPath,
      intervalSeconds: Number(el.intervalSeconds.value) || 8,
      captureSeconds: Number(el.captureSeconds.value) || 1,
      duration: Number(el.duration.value) || 30,
    })
    unsubscribe()
    state.outputPath = outputPath

    setProgress('Generating script with Gemini...', 92)
    const scriptLanguage = el.scriptLanguage.value
    const script = await generateScriptWithGemini(apiKey, scriptLanguage, '')

    setProgress('Done!', 100)
    showResult(outputPath, script)
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err))
  } finally {
    updateCanSubmit()
  }
})

el.saveVideoBtn.addEventListener('click', async () => {
  if (!state.outputPath) return
  const suggestedName = `${(el.title.value.trim() || 'recap').replace(/[\\/:*?"<>|]/g, '_')}.mp4`
  const destPath = await window.desktopApi.saveVideoAs(suggestedName)
  if (!destPath) return
  await window.desktopApi.copyFile(state.outputPath, destPath)
  await window.desktopApi.showInFolder(destPath)
})

el.copyScriptBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(el.scriptOutput.value)
  const original = el.copyScriptBtn.textContent
  el.copyScriptBtn.textContent = 'Copied!'
  setTimeout(() => {
    el.copyScriptBtn.textContent = original
  }, 1500)
})

recalcInterval()
updateCanSubmit()
