const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform information
  platform: process.platform,
  
  // Environment check
  isElectron: true,
  
  // Version information
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  
  // Fullscreen event listener
  onFullscreenChange: (callback) => {
    ipcRenderer.on('fullscreen-changed', (event, isFullscreen) => {
      callback(isFullscreen);
    });
  },
  
  // Remove fullscreen event listener
  removeFullscreenListener: () => {
    ipcRenderer.removeAllListeners('fullscreen-changed');
  },
  
  // Get current fullscreen state
  getFullscreenState: () => ipcRenderer.invoke('get-fullscreen-state'),
});
