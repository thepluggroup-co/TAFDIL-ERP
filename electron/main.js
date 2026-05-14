const { app, BrowserWindow, Menu, Tray, globalShortcut,
        ipcMain, Notification, nativeImage, shell } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { initLocalDb, createSdkAdapter } = require('./src/db/localDb');
const { registerPrinterHandlers } = require('./src/ipc/printerIpc');
const { registerScannerHandlers } = require('./src/ipc/scannerIpc');
const { registerSyncHandlers } = require('./src/ipc/syncIpc');
const { TafdilClient } = require('@tafdil/sdk');

const isDev = !app.isPackaged;
const FRONTEND_URL = isDev ? 'http://localhost:5173' : `file://${path.join(__dirname, '../frontend/dist/index.html')}`;

let mainWindow = null;
let tray = null;
let pendingBonsCount = 0;
let sdkClient = null;

// ── SDK TAFDIL — connexion + status bar ──────────────────────────────────────
async function initSdk() {
  const adapter = createSdkAdapter();
  sdkClient = new TafdilClient({
    supabaseUrl:     process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    apiGatewayUrl:   process.env.API_GATEWAY_URL || 'http://localhost:3000',
    jwtToken:        process.env.ERP_SERVICE_JWT,
    storageAdapter:  adapter,
  });

  await sdkClient.connect();

  // 🟢 / 🔴 barre de statut Electron
  sdkClient.onStatusChange(({ online, pending }) => {
    const label = online
      ? `🟢 Connecté${pending > 0 ? ` · ${pending} ops en attente` : ''}`
      : `🔴 Hors ligne (${pending} ops en attente)`;
    mainWindow?.webContents.send('sync-status', { online, pending, label });
    tray?.setToolTip(`TAFDIL ERP · ${label}`);
  });

  // Nouvelle commande e-commerce → notif système
  sdkClient.onNewOrder(payload => {
    new Notification({
      title: 'Nouvelle commande e-commerce',
      body: `Client : ${payload.client} · ${payload.montant?.toLocaleString('fr-CM')} XAF`,
    }).show();
    mainWindow?.webContents.send('realtime-event', { channel: 'commandes-live', payload });
  });

  // Paiement confirmé → notif
  sdkClient.onPaymentConfirmed(payload => {
    new Notification({
      title: '✅ Paiement confirmé',
      body: `Commande ${payload.commande_id} · ${payload.montant?.toLocaleString('fr-CM')} XAF · ${payload.mode}`,
    }).show();
    mainWindow?.webContents.send('realtime-event', { channel: 'paiements', payload });
  });

  // Stock mis à jour
  sdkClient.onStockChange(payload => {
    mainWindow?.webContents.send('realtime-event', { channel: 'boutique-stock', payload });
  });

  // Sync manuelle depuis le renderer
  ipcMain.handle('sdk-sync', async () => {
    return sdkClient.sync();
  });

  console.log('[SDK] Connecté — ERP natif en ligne');
}

// Expose le client SDK pour syncIpc.js
function getSdkClient() { return sdkClient; }
module.exports.getSdkClient = getSdkClient;

// ── Création fenêtre principale ──────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'TAFDIL ERP',
    icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    backgroundColor: '#f9fafb',
    show: false,
  });

  mainWindow.loadURL(FRONTEND_URL);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });

  // Plein écran toggle
  mainWindow.on('enter-full-screen', () =>
    mainWindow.webContents.send('fullscreen-change', true));
  mainWindow.on('leave-full-screen', () =>
    mainWindow.webContents.send('fullscreen-change', false));
}

// ── Tray icon ────────────────────────────────────────────────
function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets/tray-icon.png'));
  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const updateTrayMenu = () => {
    const menu = Menu.buildFromTemplate([
      { label: `TAFDIL ERP`, enabled: false },
      { type: 'separator' },
      {
        label: pendingBonsCount > 0 ? `⚠ ${pendingBonsCount} bon(s) en attente` : 'Aucun bon en attente',
        enabled: pendingBonsCount > 0,
        click: () => { mainWindow?.show(); mainWindow?.webContents.send('navigate', '/produits-finis/production'); },
      },
      { type: 'separator' },
      { label: 'Afficher', click: () => mainWindow?.show() },
      { label: 'Quitter', click: () => app.quit() },
    ]);
    tray.setContextMenu(menu);
    tray.setToolTip(`TAFDIL ERP${pendingBonsCount > 0 ? ` · ${pendingBonsCount} bons en attente` : ''}`);
  };

  updateTrayMenu();
  tray.on('double-click', () => mainWindow?.show());

  // Exposer la mise à jour du compteur via IPC
  ipcMain.on('update-tray-count', (_, count) => {
    pendingBonsCount = count;
    updateTrayMenu();
    // Badge (Mac seulement)
    if (process.platform === 'darwin') app.dock.setBadge(count > 0 ? String(count) : '');
  });
}

// ── Menu natif ────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: 'Fichier',
      submenu: [
        { label: 'Nouvelle vente (F1)', accelerator: 'F1',
          click: () => mainWindow?.webContents.send('navigate', '/quincaillerie/vente') },
        { type: 'separator' },
        { label: 'Quitter', role: 'quit' },
      ],
    },
    {
      label: 'Modules',
      submenu: [
        { label: 'Tableau de bord',     click: () => mainWindow?.webContents.send('navigate', '/dashboard') },
        { label: 'Vente comptoir',      click: () => mainWindow?.webContents.send('navigate', '/quincaillerie/vente') },
        { label: 'Stock',               click: () => mainWindow?.webContents.send('navigate', '/quincaillerie/stock') },
        { type: 'separator' },
        { label: 'Catalogue produits finis', click: () => mainWindow?.webContents.send('navigate', '/produits-finis/catalogue') },
        { label: 'Bons de production',  click: () => mainWindow?.webContents.send('navigate', '/produits-finis/production') },
        { label: 'Commandes',           click: () => mainWindow?.webContents.send('navigate', '/produits-finis/commandes') },
      ],
    },
    {
      label: 'Paramètres',
      submenu: [
        { label: 'Imprimante tickets',  click: () => mainWindow?.webContents.send('open-settings', 'printer-ticket') },
        { label: 'Imprimante A4',       click: () => mainWindow?.webContents.send('open-settings', 'printer-a4') },
        { label: 'Scanner code-barres', click: () => mainWindow?.webContents.send('open-settings', 'scanner') },
        { type: 'separator' },
        { label: 'Vérifier les mises à jour', click: () => autoUpdater.checkForUpdatesAndNotify() },
      ],
    },
    {
      label: 'Aide',
      submenu: [
        { label: 'Documentation', click: () => shell.openExternal('https://docs.tafdil.cm') },
        { label: 'Plein écran', accelerator: 'F11',
          click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()) },
        { label: 'Outils développeur', accelerator: 'F12',
          click: () => mainWindow?.webContents.toggleDevTools() },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Raccourcis clavier caisse ─────────────────────────────────
function registerShortcuts() {
  globalShortcut.register('F1', () => mainWindow?.webContents.send('shortcut', 'nouvelle-vente'));
  globalShortcut.register('F2', () => mainWindow?.webContents.send('shortcut', 'valider-paiement-cash'));
  globalShortcut.register('F3', () => mainWindow?.webContents.send('shortcut', 'imprimer-ticket'));
  globalShortcut.register('F4', () => mainWindow?.webContents.send('shortcut', 'annuler'));
  globalShortcut.register('F5', () => mainWindow?.webContents.send('shortcut', 'rapport-jour'));
  globalShortcut.register('Escape', () => mainWindow?.webContents.send('shortcut', 'vider-panier'));
}

// ── Notifications système ──────────────────────────────────────
ipcMain.on('system-notification', (_, { title, body, urgency }) => {
  new Notification({ title, body, urgency: urgency || 'normal' }).show();
});

// ── Auto-updater ───────────────────────────────────────────────
function setupAutoUpdater() {
  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', () => {
    mainWindow?.webContents.send('update-available');
  });
  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update-ready');
  });

  ipcMain.on('restart-to-update', () => autoUpdater.quitAndInstall());
}

// ── App lifecycle ──────────────────────────────────────────────
app.whenReady().then(async () => {
  await initLocalDb();
  createMainWindow();
  createTray();
  buildMenu();
  registerShortcuts();
  registerPrinterHandlers(ipcMain);
  registerScannerHandlers(ipcMain);
  registerSyncHandlers(ipcMain);
  setupAutoUpdater();
  // SDK en dernier — connexion Realtime non bloquante
  initSdk().catch(err => console.warn('[SDK] Démarrage hors ligne:', err.message));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
