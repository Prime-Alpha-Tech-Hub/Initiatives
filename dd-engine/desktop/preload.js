const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ddEngine', {
  isNative:     true,
  saveReview:   (entry)   => ipcRenderer.invoke('save-review',  entry),
  loadReviews:  ()        => ipcRenderer.invoke('load-reviews'),
  deleteReview: (key)     => ipcRenderer.invoke('delete-review', key),
  pickFile:     ()        => ipcRenderer.invoke('pick-file'),
  pickFolder:   ()        => ipcRenderer.invoke('pick-folder'),
  readFile:     (p)       => ipcRenderer.invoke('read-file',    p),
  getConfig:    ()        => ipcRenderer.invoke('get-config'),
  saveConfig:   (cfg)     => ipcRenderer.invoke('save-config',  cfg),
  getApiKey:    ()        => ipcRenderer.invoke('get-api-key'),
  saveApiKey:   (key)     => ipcRenderer.invoke('save-api-key', key),
});
