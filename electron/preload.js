const { contextBridge, ipcRenderer } = require('electron');

/**
 * Bridge sécurisé entre le renderer (React) et le main process.
 * Toutes les communications IPC passent par ce fichier.
 */
contextBridge.exposeInMainWorld('tafdilDesktop', {
  // Navigation forcée depuis le main
  onNavigate: (cb) => ipcRenderer.on('navigate', (_, path) => cb(path)),

  // Raccourcis clavier caisse
  onShortcut: (cb) => ipcRenderer.on('shortcut', (_, action) => cb(action)),

  // Mise à jour du compteur tray
  updateTrayCount: (count) => ipcRenderer.send('update-tray-count', count),

  // Notifications système
  notify: (title, body, urgency) =>
    ipcRenderer.send('system-notification', { title, body, urgency }),

  // Impression
  printTicket: (pdfBuffer) => ipcRenderer.invoke('print-ticket', pdfBuffer),
  printA4: (pdfBuffer) => ipcRenderer.invoke('print-a4', pdfBuffer),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  setPrinterDefault: (type, name) => ipcRenderer.invoke('set-printer-default', type, name),

  // Base de données locale (SQLite offline)
  db: {
    insertVente: (vente) => ipcRenderer.invoke('db-insert-vente', vente),
    getVentesNonSynchro: () => ipcRenderer.invoke('db-get-ventes-non-synchro'),
    marquerSynchro: (ids) => ipcRenderer.invoke('db-marquer-synchro', ids),
  },

  // Sync
  syncNow: () => ipcRenderer.invoke('sync-now'),
  onSyncStatus: (cb) => ipcRenderer.on('sync-status', (_, status) => cb(status)),

  // Scanner
  onBarcodeScan: (cb) => ipcRenderer.on('barcode-scan', (_, code) => cb(code)),

  // Auto-update
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', cb),
  onUpdateReady: (cb) => ipcRenderer.on('update-ready', cb),
  restartToUpdate: () => ipcRenderer.send('restart-to-update'),

  // Fullscreen
  onFullscreenChange: (cb) => ipcRenderer.on('fullscreen-change', (_, state) => cb(state)),
});
