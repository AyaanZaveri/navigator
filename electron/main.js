const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { join, resolve } = require('path');
const { spawn } = require('child_process');
const http = require('http');

const isDev = !app.isPackaged;
const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL || 'http://localhost:3000';
const PROD_HOST = '127.0.0.1';
const PROD_PORT = Number(process.env.ELECTRON_APP_PORT || 3123);
const PROD_SERVER_URL = `http://${PROD_HOST}:${PROD_PORT}`;
let mainWindow;
let nextServerProcess;

// Enable live reload for Electron in development
if (isDev) {
  require('electron-reload')(__dirname, {
    electron: join(__dirname, '..', 'node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit'
  });
}

async function createWindow() {
  const windowIcon = isDev
    ? join(__dirname, '..', 'public', 'logo', 'desktop', 'navigator.png')
    : join(app.getAppPath(), '.next', 'standalone', 'public', 'logo', 'desktop', 'navigator.png');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: windowIcon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: join(__dirname, 'preload.js'),
      webSecurity: !isDev,
    },
    titleBarStyle: 'hiddenInset',
    show: true,
    backgroundColor: '#ffffff',
  });

  mainWindow.show();
  mainWindow.focus();

  try {
    if (!isDev) {
      await startStandaloneServer();
    }
    await mainWindow.loadURL(isDev ? DEV_SERVER_URL : PROD_SERVER_URL);
  } catch (error) {
    console.error('Failed to load app:', error);
    mainWindow.loadURL(`data:text/html;charset=utf-8,
      <html>
        <body style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
          <h1>App Startup Error</h1>
          <p>Could not load the Navigator application.</p>
          <p>Mode: ${isDev ? 'development' : 'production'}</p>
          <p>Error: ${error.message}</p>
        </body>
      </html>
    `);
  }

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', errorCode, errorDescription, validatedURL);
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${sourceId}:${line} ${message}`);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('fullscreen-changed', true);
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('fullscreen-changed', false);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

async function startStandaloneServer() {
  if (nextServerProcess) return;

  const appPath = app.getAppPath();
  const serverEntry = join(appPath, '.next', 'standalone', 'server.js');

  nextServerProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: PROD_HOST,
      PORT: String(PROD_PORT),
      ELECTRON: 'true',
      ELECTRON_RUN_AS_NODE: '1',
      NEXT_PRIVATE_STANDALONE: 'true',
    },
    stdio: isDev ? 'inherit' : 'pipe',
  });

  nextServerProcess.on('exit', (code, signal) => {
    console.error(`Standalone server exited (code=${code}, signal=${signal})`);
    nextServerProcess = null;
  });

  await waitForServer(PROD_HOST, PROD_PORT, 15000);
}

function waitForServer(host, port, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolvePromise, rejectPromise) => {
    const tryConnect = () => {
      const req = http.get({ host, port, path: '/', timeout: 2000 }, (res) => {
        res.destroy();
        resolvePromise();
      });

      req.on('error', () => {
        if (Date.now() - startedAt > timeoutMs) {
          rejectPromise(new Error(`Timed out waiting for ${host}:${port}`));
          return;
        }
        setTimeout(tryConnect, 250);
      });

      req.on('timeout', () => {
        req.destroy();
      });
    };

    tryConnect();
  });
}

function stopStandaloneServer() {
  if (!nextServerProcess) return;
  nextServerProcess.kill('SIGTERM');
  nextServerProcess = null;
}

// App event listeners
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  stopStandaloneServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
    return;
  }

  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  }
});

// IPC handler to get current fullscreen state
ipcMain.handle('get-fullscreen-state', async () => {
  if (mainWindow) {
    return { isFullscreen: mainWindow.isFullScreen() };
  }
  return { isFullscreen: false };
});

// Handle app protocol for deep linking (optional)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('navigator', process.execPath, [resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('navigator');
}

app.on('before-quit', () => {
  stopStandaloneServer();
});
