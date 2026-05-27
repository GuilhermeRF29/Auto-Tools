const { app, BrowserWindow, dialog, ipcMain } = require('electron');
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
    hostname: '127.0.0.1', // Restaurado para IPv4 fixo para evitar erro de ::1
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
  const seedFiles = ['.env', 'token.json', 'firebase-credentials.json'];
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

  // Usamos o executável do Electron para rodar o script do backend.
  // IMPORTANTE: serverEntry deve estar fora do ASAR (usando asarUnpack no package.json).
  backendProcess = spawn(process.execPath, [serverEntry], {
    cwd: path.dirname(serverEntry),
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

let currentUser = null;

// =========================================================================
// Listeners e Handlers Globais IPC do Electron
// Registrados apenas uma vez no processo principal
// =========================================================================

// Diálogos nativos
ipcMain.handle('dialog:openDirectory', async () => {
  if (!mainWindow) return '';
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });
  if (canceled) return '';
  return filePaths[0];
});

ipcMain.handle('dialog:openExcelFiles', async () => {
  if (!mainWindow) return [];
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Arquivos Excel', extensions: ['xlsx', 'xls', 'xlsm'] }
    ]
  });
  if (canceled) return [];
  return filePaths;
});

// Gerenciamento de sessão em memória
ipcMain.on('auth:set-user', (e, user) => {
  currentUser = user;
});

ipcMain.on('auth:get-user-sync', (e) => {
  e.returnValue = currentUser;
});

// Ação de recriação de janela
ipcMain.on('window:recreate', (e, isLoggedIn) => {
  recreateMainWindow(isLoggedIn);
});

// Controles de janela para a tela de login (frameless)
ipcMain.on('window:minimize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.minimize();
});

ipcMain.on('window:maximize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('window:close', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.close();
});

ipcMain.on('window:set-size', (e, width, height, resizable = true) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) {
    const isMax = win.isMaximized();
    if (isMax) win.unmaximize();
    win.setResizable(true);
    win.setSize(width, height);
    win.setResizable(resizable);
    win.center();
  }
});

const createMainWindow = async (isLoggedIn = false) => {
  // Configurações base da janela conforme o estado de autenticação
  const windowOptions = isLoggedIn ? {
    icon: path.join(__dirname, 'icon.png'),
    width: 1420,
    height: 800,
    minWidth: 500,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    transparent: false,
    hasShadow: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  } : {
    icon: path.join(__dirname, 'icon.png'),
    width: 900,
    height: 500,
    minWidth: 500,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    transparent: false,
    hasShadow: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  };

  mainWindow = new BrowserWindow(windowOptions);

  const targetUrl = isDev
    ? DEV_RENDERER_URL
    : `http://127.0.0.1:${SERVER_PORT}`;

  await mainWindow.loadURL(targetUrl);
  mainWindow.show();

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Notificar o frontend sobre mudanças de maximização
  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximized-changed', true);
    }
  });
  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximized-changed', false);
    }
  });
};

let isRecreating = false;

const recreateMainWindow = async (isLoggedIn) => {
  isRecreating = true;
  if (mainWindow) {
    mainWindow.destroy();
    mainWindow = null;
  }
  await createMainWindow(isLoggedIn);
  isRecreating = false;
};

// Flags de aceleração GPU para melhor performance com janela transparente
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-native-gpu-memory-buffers');

app.whenReady().then(async () => {
  try {
    startBackend();
    const ready = await waitForBackendReady();
    if (!ready) {
      throw new Error('Backend não ficou disponível a tempo.');
    }

    await createMainWindow(false);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    dialog.showErrorBox('Falha ao iniciar Auto Tools', message);
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow(false);
  }
});

app.on('window-all-closed', () => {
  if (isRecreating) return;
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
});
