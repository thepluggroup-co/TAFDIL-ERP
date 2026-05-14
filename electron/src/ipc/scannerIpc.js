const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const Store = require('electron-store');
const store = new Store();
let activePort = null;

/**
 * Gestion scanner code-barres USB/Bluetooth via serialport.
 * À la lecture d'un code, émet 'barcode-scan' vers le renderer.
 */
function registerScannerHandlers(ipcMain) {
  let mainWindow = null;

  // Lister les ports série disponibles
  ipcMain.handle('scanner-list-ports', async () => {
    return SerialPort.list();
  });

  // Connecter un scanner
  ipcMain.handle('scanner-connect', async (event, portPath) => {
    if (activePort?.isOpen) activePort.close();
    mainWindow = require('electron').BrowserWindow.fromWebContents(event.sender);

    activePort = new SerialPort({ path: portPath, baudRate: 9600 });
    const parser = activePort.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    parser.on('data', (code) => {
      const barcode = code.trim();
      if (barcode) mainWindow?.webContents.send('barcode-scan', barcode);
    });

    store.set('scanner.port', portPath);
    return { ok: true, port: portPath };
  });

  // Déconnecter
  ipcMain.handle('scanner-disconnect', () => {
    if (activePort?.isOpen) activePort.close();
    activePort = null;
    return { ok: true };
  });

  // Auto-reconnecter au démarrage si port mémorisé
  const savedPort = store.get('scanner.port');
  if (savedPort) {
    SerialPort.list().then(ports => {
      if (ports.some(p => p.path === savedPort)) {
        activePort = new SerialPort({ path: savedPort, baudRate: 9600 });
        const parser = activePort.pipe(new ReadlineParser({ delimiter: '\r\n' }));
        parser.on('data', (code) => {
          const barcode = code.trim();
          if (barcode) {
            require('electron').BrowserWindow.getAllWindows()[0]
              ?.webContents.send('barcode-scan', barcode);
          }
        });
      }
    }).catch(() => {});
  }
}

module.exports = { registerScannerHandlers };
