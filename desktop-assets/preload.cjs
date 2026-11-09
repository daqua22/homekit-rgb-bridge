const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  security: {
    sandboxed: process.sandboxed,
    contextIsolated: process.contextIsolated,
  },
  info: () => ipcRenderer.invoke('desktop:info'),
  preferences: (value) => ipcRenderer.invoke('desktop:preferences', value),
  chooseProfile: (path) => ipcRenderer.invoke('desktop:profile', path),
  chooseOpenRGB: () => ipcRenderer.invoke('desktop:openrgb-file'),
  startOpenRGB: () => ipcRenderer.invoke('desktop:openrgb-start'),
  openHelp: (page) => ipcRenderer.invoke('desktop:help', page),
});
