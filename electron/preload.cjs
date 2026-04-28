const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('autoToolsRuntime', {
  isElectron: true,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  // Novas funções para diálogos modernos
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  openExcelFiles: () => ipcRenderer.invoke('dialog:openExcelFiles'),
});
