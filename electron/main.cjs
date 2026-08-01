const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');

// Set to true when running against the Vite dev server (npm run electron:dev)
const isDev = !app.isPackaged && process.env.ELECTRON_START_URL;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    // Load from the running Vite dev server
    mainWindow.loadURL(process.env.ELECTRON_START_URL);
    mainWindow.webContents.openDevTools();
  } else {
    // Load the built static files
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Open external links (target=_blank / http links) in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
