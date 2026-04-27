const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const SERVER_PORT = Number(process.env.AUTOTOOLS_SERVER_PORT || 3001);
const DEV_RENDERER_URL = process.env.AUTOTOOLS_RENDERER_URL || 'http://localhost:3000';

let backendProcess = null;
let mainWindow = null;

const isDev = !app.isPackaged;

const getServerEntry = () => {
  const appPath = app.getAppPath();
  const unpackedPath = appPath.replace('app.asar', 'app.asar.unpacked');
  const serverPath = path.join(unpackedPath, 'server.js');
  return fs.existsSync(serverPath) ? serverPath : path.join(appPath, 'server.js');
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const probeBackend = () => new Promise((resolve) => {
  const req = http.get({
    hostname: 'localhost', // Mudado de 127.0.0.1
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

const bootstrapDataDir = (dataDir) => {
  const seedFiles = ['Userbank.db', '.env', 'token.json', 'firebase-credentials.json'];
  const appPath = app.getAppPath();
  const unpackedPath = appPath.replace('app.asar', 'app.asar.unpacked');

  seedFiles.forEach((file) => {
    // Tenta pegar da raiz ou da pasta unpacked
    const src = fs.existsSync(path.join(unpackedPath, file)) 
                ? path.join(unpackedPath, file) 
                : path.join(appPath, file);
    const dest = path.join(dataDir, file);

    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      try {
        fs.copyFileSync(src, dest);
        console.log(`[ELECTRON] Seeded ${file} to ${dataDir}`);
      } catch (err) {
        console.error(`[ELECTRON] Failed to seed ${file}: ${err.message}`);
      }
    }
  });
};

const startBackend = () => {
  if (backendProcess && !backendProcess.killed) return;

  const serverEntry = getServerEntry();
  const dataDir = path.join(app.getPath('userData'), 'runtime-data');
  const logFile = path.join(dataDir, 'backend_log.txt');
  
  fs.mkdirSync(dataDir, { recursive: true });
  bootstrapDataDir(dataDir);

  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  logStream.write(`\n--- Backend Start: ${new Date().toISOString()} ---\n`);
  logStream.write(`Server Entry: ${serverEntry}\n`);

  const getPythonExecutable = () => {
    if (isDev) {
      const portablePath = path.resolve(app.getAppPath(), 'python-runtime', 'python.exe');
      if (fs.existsSync(portablePath)) return portablePath;
      return path.resolve(app.getAppPath(), 'venv', 'Scripts', 'python.exe');
    } else {
      // Em produção (resourcesPath)
      const portablePath = path.join(process.resourcesPath, 'python-runtime', 'python.exe');
      if (fs.existsSync(portablePath)) return portablePath;
      return path.join(process.resourcesPath, 'venv', 'Scripts', 'python.exe');
    }
  };

  const venvPath = getPythonExecutable();

  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    ComSpec: process.env.ComSpec,
    WINDIR: process.env.WINDIR,
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: isDev ? 'development' : 'production',
    AUTOTOOLS_SERVER_PORT: String(SERVER_PORT),
    AUTOTOOLS_SERVE_FRONTEND: '1',
    AUTOTOOLS_APP_ROOT: app.getAppPath(),
    AUTOTOOLS_DATA_DIR: dataDir,
    AUTOTOOLS_PYTHON_PATH: venvPath,
    GMAIL_TOKEN_PATH: path.join(dataDir, 'token.json'),
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
  };

  // Usamos spawn direto sem Shell para evitar problemas de encoding e dependência do cmd.exe
  backendProcess = spawn(process.execPath, [serverEntry], {
    cwd: path.dirname(serverEntry), // Define o diretório de trabalho na pasta do backend
    env,
    shell: false, 
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout.pipe(logStream);
  backendProcess.stderr.pipe(logStream);

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
    if (process.platform === 'win32') {
      const pid = backendProcess.pid;
      console.log(`[ELECTRON] Finalizando árvore de processos do backend (PID ${pid})...`);
      // Usamos taskkill /F /T para garantir que o processo e seus filhos (como o Python) morram
      spawn('taskkill', ['/F', '/T', '/PID', pid.toString()], { 
        shell: false,
        windowsHide: true 
      });
    } else {
      backendProcess.kill('SIGTERM');
      setTimeout(() => {
        if (backendProcess && !backendProcess.killed) {
          backendProcess.kill('SIGKILL');
        }
      }, 2000);
    }
  } catch (err) {
    console.error(`[ELECTRON] Erro ao parar backend: ${err.message}`);
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
