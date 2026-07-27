const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopApi', {
  selectVideo: () => ipcRenderer.invoke('dialog:selectVideo'),
  saveVideoAs: (suggestedName) => ipcRenderer.invoke('dialog:saveVideo', suggestedName),
  showInFolder: (filePath) => ipcRenderer.invoke('shell:showInFolder', filePath),
  getVideoDuration: (filePath) => ipcRenderer.invoke('ffmpeg:getDuration', filePath),
  createRecap: (options) => ipcRenderer.invoke('ffmpeg:createRecap', options),
  getTempPath: (filename) => ipcRenderer.invoke('fs:tempPath', filename),
  copyFile: (src, dest) => ipcRenderer.invoke('fs:copyFile', { src, dest }),
  onProgress: (callback) => {
    const listener = (_event, progress) => callback(progress)
    ipcRenderer.on('ffmpeg:progress', listener)
    return () => ipcRenderer.removeListener('ffmpeg:progress', listener)
  },
})
