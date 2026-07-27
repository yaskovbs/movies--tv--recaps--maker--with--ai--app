const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const fs = require('fs')

// ffmpeg-static resolves to a path inside app.asar when packaged, but binaries
// can't run from inside an asar archive - asarUnpack (see package.json) copies
// the real binary next to it in app.asar.unpacked, so redirect the path there.
const ffmpegPath = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0f1117',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// --- File dialogs ---------------------------------------------------------

ipcMain.handle('dialog:selectVideo', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select a video file',
    properties: ['openFile'],
    filters: [{ name: 'Video', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  return { path: filePath, name: path.basename(filePath), size: fs.statSync(filePath).size }
})

ipcMain.handle('dialog:saveVideo', async (_event, suggestedName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save recap video',
    defaultPath: suggestedName || 'recap.mp4',
    filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
  })
  if (result.canceled || !result.filePath) return null
  return result.filePath
})

ipcMain.handle('shell:showInFolder', async (_event, filePath) => {
  shell.showItemInFolder(filePath)
})

// --- Filesystem helpers ------------------------------------------------
// The renderer runs with nodeIntegration disabled, so it has no `fs`/`os`
// access of its own - these two handlers are the minimal surface it needs:
// a scratch path to render the recap into, and a way to copy that scratch
// file to wherever the user picked in the "Save As" dialog.

ipcMain.handle('fs:tempPath', async (_event, filename) => {
  return path.join(app.getPath('temp'), filename)
})

ipcMain.handle('fs:copyFile', async (_event, { src, dest }) => {
  fs.copyFileSync(src, dest)
  return dest
})

// --- FFmpeg: probe duration ------------------------------------------------

function parseDurationToSeconds(stderrText) {
  const match = stderrText.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/)
  if (!match) return null
  const [, hh, mm, ss, cs] = match
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(cs) / 100
}

ipcMain.handle('ffmpeg:getDuration', async (_event, filePath) => {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-i', filePath])
    let stderrText = ''
    proc.stderr.on('data', (chunk) => {
      stderrText += chunk.toString()
    })
    proc.on('error', reject)
    proc.on('close', () => {
      const duration = parseDurationToSeconds(stderrText)
      if (duration == null) {
        reject(new Error('Could not read video duration.'))
      } else {
        resolve(duration)
      }
    })
  })
})

// --- FFmpeg: create the recap clip -----------------------------------------
//
// Same filter graph and encode settings proven out in the web app
// (src/components/HomePage.tsx), but run through the real native ffmpeg
// binary instead of ffmpeg.wasm, with -threads 0 (use all available CPU
// cores) since there is no browser COOP/COEP constraint here. This is what
// actually fixes the slowness the web version has on long/large videos.

ipcMain.handle('ffmpeg:createRecap', async (event, options) => {
  const { inputPath, outputPath, intervalSeconds, captureSeconds, duration } = options

  const selectFilter = `select='lt(mod(t,${intervalSeconds}),${captureSeconds})',setpts=N/FRAME_RATE/TB`

  const args = [
    '-i', inputPath,
    '-vf', `${selectFilter},scale='min(1280,iw)':-2`,
    '-an',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '26',
    '-movflags', '+faststart',
    '-t', String(duration),
    '-threads', '0',
    '-progress', 'pipe:1',
    '-nostats',
    '-y',
    outputPath,
  ]

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args)
    let stderrTail = ''

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      const outTimeMatch = text.match(/out_time_ms=(\d+)/)
      if (outTimeMatch) {
        const outTimeSeconds = Number(outTimeMatch[1]) / 1_000_000
        const progress = Math.min(1, outTimeSeconds / duration)
        event.sender.send('ffmpeg:progress', progress)
      }
    })

    proc.stderr.on('data', (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-4000)
    })

    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        event.sender.send('ffmpeg:progress', 1)
        resolve(outputPath)
      } else {
        reject(new Error(`FFmpeg exited with code ${code}.\n${stderrTail}`))
      }
    })
  })
})
