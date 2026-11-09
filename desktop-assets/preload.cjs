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
  startOpenRGB: () => ipcRenderer.invoke('desktop:openrgb-start', false),
  ensureOpenRGB: () => ipcRenderer.invoke('desktop:openrgb-start', true),
  configureStartup: (enabled) =>
    ipcRenderer.invoke('desktop:configure-startup', enabled),
  startupStatus: () => ipcRenderer.invoke('desktop:startup-status'),
  checkPrerequisites: () => ipcRenderer.invoke('desktop:prerequisites'),
  openHelp: (page) => ipcRenderer.invoke('desktop:help', page),
});
