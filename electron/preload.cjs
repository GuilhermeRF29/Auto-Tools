const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('autoToolsRuntime', {
  isElectron: true,
  hasFrame: false,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  // Novas funções para diálogos modernos
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  openExcelFiles: () => ipcRenderer.invoke('dialog:openExcelFiles'),
  // Sessão persistente em memória no Electron
  auth: {
    setUser: (user) => ipcRenderer.send('auth:set-user', user),
    getUserSync: () => ipcRenderer.sendSync('auth:get-user-sync'),
  },
  // Controles de Janela
  windowControls: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    recreateWindow: (isLoggedIn) => ipcRenderer.send('window:recreate', isLoggedIn),
    setSize: (width, height, resizable) => ipcRenderer.send('window:set-size', width, height, resizable),
    onMaximizeChanged: (callback) => {
      ipcRenderer.on('window:maximized-changed', (_, isMaximized) => callback(isMaximized));
    }
  }
});
