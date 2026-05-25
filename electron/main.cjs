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

const createMainWindow = async () => {
  // Criação da janela principal do Electron com configurações de design premium
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 800,
    minWidth: 500,
    minHeight: 500,
    show: false, // Mantém a janela oculta até carregar totalmente o HTML/URL (evita flash branco)
    autoHideMenuBar: true, // Oculta a barra de menu clássica (Arquivo, Editar, etc.)
    frame: false, // Desativa a moldura padrão do Windows (cria janela chromeless)
    titleBarStyle: 'hidden', // Esconde a barra de títulos do Windows
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), // Pre-carregador para expor IPC seguro
      contextIsolation: true, // Garante que scripts da página web não acessem o contexto do Node diretamente
      nodeIntegration: false, // Impede injeção direta do Node no frontend por segurança
      sandbox: false, // Permite acesso a recursos controlados necessários no Preload
    },
  });

  // Define a URL alvo de carregamento (Vite Dev Server em desenvolvimento ou Express Local em produção)
  const targetUrl = isDev
    ? DEV_RENDERER_URL
    : `http://127.0.0.1:${SERVER_PORT}`;

  await mainWindow.loadURL(targetUrl);
  mainWindow.show(); // Exibe a janela já renderizada com os dados carregados

  if (isDev) {
    // Abre a ferramenta do desenvolvedor (DevTools) desconectada da janela em modo dev
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Handlers para Diálogos Nativos (Modernos) utilizando chamadas assíncronas do Electron dialog
  ipcMain.handle('dialog:openDirectory', async () => {
    // Abre caixa de diálogo nativa do Windows para seleção de diretório
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
    });
    if (canceled) return '';
    return filePaths[0]; // Retorna a pasta selecionada ou vazio se cancelado
  });

  ipcMain.handle('dialog:openExcelFiles', async () => {
    // Abre caixa de diálogo nativa do Windows para seleção múltipla de planilhas Excel
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Arquivos Excel', extensions: ['xlsx', 'xls', 'xlsm'] }
      ]
    });
    if (canceled) return [];
    return filePaths; // Retorna array de arquivos selecionados
  });

  // =========================================================================
  // Controles Customizados de Janela (IPC Lógica)
  // Como o app usa 'frame: false', os botões da barra superior enviam sinais IPC 
  // que o Processo Principal (este arquivo) escuta para manipular a janela nativa.
  // =========================================================================
  
  // Minimiza a janela atual
  ipcMain.on('window:minimize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) win.minimize();
  });

  // Maximiza ou restaura o tamanho original da janela
  ipcMain.on('window:maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) {
      if (win.isMaximized()) win.restore();
      else win.maximize();
    }
  });

  // Fecha o aplicativo completamente
  ipcMain.on('window:close', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) win.close();
  });

  // Escuta mudanças de estado da janela (se o usuário maximizar clicando nas bordas, por exemplo)
  // e notifica o frontend para atualizar o ícone do botão (Maximizado vs Restaurado)
  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized-changed', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized-changed', false));
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
