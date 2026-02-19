/**
 * Electron Preload Script
 * Exposes a safe API to the renderer (Next.js page) via contextBridge.
 * Renderer can call window.electron.* to interact with native OS features.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    /** Open a native Save File dialog */
    showSaveDialog: (opts) => ipcRenderer.invoke('show-save-dialog', opts),

    /** Open a native Open File dialog */
    showOpenDialog: (opts) => ipcRenderer.invoke('show-open-dialog', opts),

    /** Get the user data path (for SQLite db, output folder etc.) */
    getAppPath: () => ipcRenderer.invoke('get-app-path'),

    /** Check if running inside Electron */
    isElectron: true,
});
