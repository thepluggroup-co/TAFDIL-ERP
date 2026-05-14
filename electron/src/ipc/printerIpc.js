const { webContents } = require('electron');
const Store = require('electron-store');
const store = new Store();

/**
 * Enregistre les handlers IPC pour l'impression.
 * Mémorise l'imprimante par défaut par type de document (ticket/a4).
 */
function registerPrinterHandlers(ipcMain) {
  // Lister les imprimantes disponibles
  ipcMain.handle('get-printers', async () => {
    const wc = webContents.getAllWebContents()[0];
    if (!wc) return [];
    return wc.getPrintersAsync();
  });

  // Définir imprimante par défaut
  ipcMain.handle('set-printer-default', (_, type, name) => {
    store.set(`printer.${type}`, name);
    return { ok: true };
  });

  // Imprimer ticket thermique 58mm
  ipcMain.handle('print-ticket', async (event, pdfBase64) => {
    const printerName = store.get('printer.ticket');
    const win = require('electron').BrowserWindow.fromWebContents(event.sender);
    return win.webContents.print({
      silent: true,
      printBackground: true,
      deviceName: printerName || '',
      pageSize: { width: 58000, height: 200000 }, // microns
      margins: { marginType: 'none' },
    }, (success, failureReason) => {
      if (!success) console.error('Erreur impression ticket :', failureReason);
    });
  });

  // Imprimer document A4
  ipcMain.handle('print-a4', async (event, pdfBase64) => {
    const printerName = store.get('printer.a4');
    const win = require('electron').BrowserWindow.fromWebContents(event.sender);
    return win.webContents.print({
      silent: false, // Afficher dialogue pour A4
      deviceName: printerName || '',
      pageSize: 'A4',
    });
  });
}

module.exports = { registerPrinterHandlers };
