const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('autoToolsRuntime', {
  isElectron: true,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
