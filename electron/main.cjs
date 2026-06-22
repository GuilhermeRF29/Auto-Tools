const { app, BrowserWindow, dialog, ipcMain, utilityProcess } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { processSecrets } = require('./secureStorage.cjs');

const SERVER_PORT = Number(process.env.AUTOTOOLS_SERVER_PORT || 3001);
const DEV_RENDERER_URL = process.env.AUTOTOOLS_RENDERER_URL || 'http://localhost:3000';

let backendProcess = null;
let mainWindow = null;
let isShuttingDown = false;

const isDev = !app.isPackaged;

const getServerEntry = () => {
  const appPath = app.getAppPath();
  const unpackedPath = appPath.includes('app.asar')
    ? appPath.replace('app.asar', 'app.asar.unpacked')
    : appPath;
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
  // Apenas cria a pasta de runtime. O processSecrets cuida do backup e do secure storage.
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
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
      const appPath = app.getAppPath();
      const unpackedPath = appPath.includes('app.asar')
        ? appPath.replace('app.asar', 'app.asar.unpacked')
        : appPath;
      const portablePath = path.resolve(unpackedPath, 'python-runtime', 'python.exe');
      if (fs.existsSync(portablePath)) return portablePath;
      return path.resolve(appPath, 'venv', 'Scripts', 'python.exe');
    } else {
      // Em produção (resourcesPath)
      const portablePath = path.join(process.resourcesPath, 'python-runtime', 'python.exe');
      if (fs.existsSync(portablePath)) return portablePath;
      return path.join(process.resourcesPath, 'venv', 'Scripts', 'python.exe');
    }
  };

  const venvPath = getPythonExecutable();

  const unpackedAppPath = app.getAppPath().includes('app.asar')
    ? app.getAppPath().replace('app.asar', 'app.asar.unpacked')
    : app.getAppPath();

  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    ComSpec: process.env.ComSpec,
    WINDIR: process.env.WINDIR,
    ...process.env,
    NODE_ENV: isDev ? 'development' : 'production',
    AUTOTOOLS_SERVER_PORT: String(SERVER_PORT),
    AUTOTOOLS_SERVE_FRONTEND: '1',
    AUTOTOOLS_APP_ROOT: unpackedAppPath,
    AUTOTOOLS_DATA_DIR: dataDir,
    AUTOTOOLS_PYTHON_PATH: venvPath,
    // Em vez dos arquivos em disco, passamos o conteúdo carregado da memória
    ...processSecrets(),
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
  };

  // Usamos utilityProcess.fork para rodar o script com suporte total a ASAR
  backendProcess = utilityProcess.fork(serverEntry, [], {
    cwd: dataDir,
    env,
    stdio: 'pipe',
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
    
    if (!isShuttingDown) {
      console.log(`[ELECTRON] Backend crash detectado. Reiniciando em 2 segundos...`);
      setTimeout(() => {
        if (!isShuttingDown) {
          console.log(`[ELECTRON] Reiniciando backend automaticamente...`);
          startBackend();
        }
      }, 2000);
    }
  });
};

const { execSync } = require('child_process');

const stopBackend = () => {
  isShuttingDown = true;
  if (!backendProcess) return;
  try {
    const pid = backendProcess.pid;
    console.log(`[ELECTRON] Finalizando processo do backend (PID ${pid})...`);
    if (pid && process.platform === 'win32') {
      try {
        execSync(`taskkill /T /F /PID ${pid}`, { timeout: 5000, windowsHide: true });
      } catch {
        backendProcess.kill();
      }
    } else {
      backendProcess.kill();
    }
    backendProcess = null;
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
ipcMain.handle('dialog:saveFileAs', async (_event, sourcePath, defaultFileName = '') => {
  if (!mainWindow) return '';

  const resolvedSource = path.resolve(String(sourcePath || ''));
  if (!fs.existsSync(resolvedSource) || path.extname(resolvedSource).toLowerCase() !== '.pptx') {
    throw new Error('Arquivo PPTX gerado nao foi encontrado para salvar.');
  }

  const safeDefaultName = path.basename(String(defaultFileName || path.basename(resolvedSource)))
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Participação de canais.pptx';

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: safeDefaultName,
    filters: [{ name: 'PowerPoint', extensions: ['pptx'] }],
  });

  if (canceled || !filePath) return '';

  fs.copyFileSync(resolvedSource, filePath);
  return filePath;
});

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
