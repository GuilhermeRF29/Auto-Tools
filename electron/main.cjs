const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const SERVER_PORT = Number(process.env.AUTOTOOLS_SERVER_PORT || 3001);
const DEV_RENDERER_URL = process.env.AUTOTOOLS_RENDERER_URL || 'http://127.0.0.1:3000';

let backendProcess = null;
let mainWindow = null;

const isDev = !app.isPackaged;

const getServerEntry = () => path.join(app.getAppPath(), 'server.js');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const probeBackend = () => new Promise((resolve) => {
  const req = http.get({
    hostname: '127.0.0.1',
    port: SERVER_PORT,
    path: '/api/status',
    timeout: 2000,
  }, (res) => {
    res.resume();
    resolve(Boolean(res.statusCode && res.statusCode < 500));
  });

  req.on('error', () => resolve(false));
  req.on('timeout', () => {
    req.destroy();
    resolve(false);
  });
});

const waitForBackendReady = async (timeoutMs = 60000) => {
  const startAt = Date.now();
  while (Date.now() - startAt < timeoutMs) {
    const ready = await probeBackend();
    if (ready) return true;
    await sleep(650);
  }
  return false;
};

const startBackend = () => {
  if (backendProcess && !backendProcess.killed) return;

  const serverEntry = getServerEntry();
  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Arquivo server.js não encontrado em ${serverEntry}`);
  }

  const dataDir = path.join(app.getPath('userData'), 'runtime-data');
  fs.mkdirSync(dataDir, { recursive: true });

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: isDev ? 'development' : 'production',
    AUTOTOOLS_SERVER_PORT: String(SERVER_PORT),
    AUTOTOOLS_SERVE_FRONTEND: '1',
    AUTOTOOLS_APP_ROOT: app.getAppPath(),
    AUTOTOOLS_DATA_DIR: dataDir,
    GMAIL_TOKEN_PATH: path.join(dataDir, 'token.json'),
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
  };

  backendProcess = spawn(process.execPath, [serverEntry], {
    cwd: app.getAppPath(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout.on('data', (chunk) => {
    process.stdout.write(`[BACKEND] ${chunk}`);
  });

  backendProcess.stderr.on('data', (chunk) => {
    process.stderr.write(`[BACKEND][ERR] ${chunk}`);
  });

  backendProcess.on('exit', (code, signal) => {
    console.log(`[BACKEND] Processo finalizado (code=${code}, signal=${signal || 'none'})`);
    backendProcess = null;
  });
};

const stopBackend = () => {
  if (!backendProcess || backendProcess.killed) return;
  try {
    backendProcess.kill();
  } catch {
    // Ignore termination errors.
  }
};

const createMainWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const targetUrl = isDev
    ? DEV_RENDERER_URL
    : `http://127.0.0.1:${SERVER_PORT}`;

  await mainWindow.loadURL(targetUrl);
  mainWindow.show();

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
};

app.whenReady().then(async () => {
  try {
    startBackend();
    const ready = await waitForBackendReady();
    if (!ready) {
      throw new Error('Backend não ficou disponível a tempo.');
    }

    await createMainWindow();
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    dialog.showErrorBox('Falha ao iniciar Auto Tools', message);
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
});
