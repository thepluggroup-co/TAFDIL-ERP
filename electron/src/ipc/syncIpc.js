const { getVentesNonSynchro, marquerSynchro, insertVente } = require('../db/localDb');

function registerSyncHandlers(ipcMain) {
  ipcMain.handle('db-insert-vente', (_, vente) => {
    insertVente(vente);
    return { ok: true };
  });

  ipcMain.handle('db-get-ventes-non-synchro', () => {
    return getVentesNonSynchro();
  });

  ipcMain.handle('db-marquer-synchro', (_, ids) => {
    marquerSynchro(ids);
    return { ok: true, count: ids.length };
  });

  ipcMain.handle('sync-now', async (event) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender);
    win?.webContents.send('sync-status', { status: 'syncing' });

    const ventes = getVentesNonSynchro();
    if (!ventes.length) {
      win?.webContents.send('sync-status', { status: 'idle', count: 0 });
      return { ok: true, synced: 0 };
    }

    // Le renderer se charge du push via tafdil-sdk
    win?.webContents.send('sync-status', { status: 'pending', count: ventes.length, ventes });
    return { ok: true, pending: ventes.length };
  });
}

module.exports = { registerSyncHandlers };
