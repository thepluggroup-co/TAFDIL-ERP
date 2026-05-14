const path = require('path');
const { app } = require('electron');
let db = null;

/**
 * Initialise la base SQLite locale (better-sqlite3).
 * Utilisée en mode hors-ligne pour stocker les ventes et opérations en attente.
 */
async function initLocalDb() {
  const Database = require('better-sqlite3');
  const dbPath = path.join(app.getPath('userData'), 'tafdil-offline.db');
  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS ventes_offline (
      id          TEXT PRIMARY KEY,
      numero      TEXT,
      vendeur_id  TEXT,
      client_type TEXT DEFAULT 'PUBLIC',
      client_nom  TEXT,
      mode_paiement TEXT DEFAULT 'ESPECES',
      montant_total REAL DEFAULT 0,
      date_vente  TEXT DEFAULT (datetime('now')),
      synced      INTEGER DEFAULT 0,
      payload     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_queue_local (
      id          TEXT PRIMARY KEY,
      table_cible TEXT NOT NULL,
      operation   TEXT NOT NULL,
      payload     TEXT NOT NULL,
      client_ts   TEXT DEFAULT (datetime('now')),
      synced      INTEGER DEFAULT 0,
      retries     INTEGER DEFAULT 0,
      last_error  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ventes_synced ON ventes_offline(synced);
    CREATE INDEX IF NOT EXISTS idx_sync_synced   ON sync_queue_local(synced);
  `);

  console.log(`SQLite local initialisé : ${dbPath}`);
  return db;
}

function getDb() {
  if (!db) throw new Error('DB non initialisée');
  return db;
}

function insertVente(vente) {
  const stmt = getDb().prepare(`
    INSERT OR REPLACE INTO ventes_offline
    (id, numero, vendeur_id, client_type, client_nom, mode_paiement, montant_total, date_vente, payload)
    VALUES (@id, @numero, @vendeur_id, @client_type, @client_nom, @mode_paiement, @montant_total, @date_vente, @payload)
  `);
  stmt.run({ ...vente, payload: JSON.stringify(vente) });
}

function getVentesNonSynchro() {
  return getDb()
    .prepare('SELECT * FROM ventes_offline WHERE synced = 0 ORDER BY date_vente')
    .all()
    .map(r => ({ ...r, payload: JSON.parse(r.payload) }));
}

function marquerSynchro(ids) {
  const stmt = getDb().prepare('UPDATE ventes_offline SET synced = 1 WHERE id = ?');
  const tx = getDb().transaction((ids) => ids.forEach(id => stmt.run(id)));
  tx(ids);
}

/**
 * Crée un StorageAdapter compatible @tafdil/sdk à injecter dans TafdilClient.
 *
 * @example
 *   const { createSdkAdapter } = require('./db/localDb');
 *   const client = new TafdilClient({ ..., storageAdapter: createSdkAdapter() });
 */
function createSdkAdapter() {
  const OFFLINE_TTL_MS = 72 * 60 * 60 * 1000;

  const pushStmt = () => getDb().prepare(`
    INSERT OR REPLACE INTO sync_queue_local
      (id, table_cible, operation, payload, client_ts, retries)
    VALUES
      (@id, @table_cible, @operation, @payload, @client_ts, @retries)
  `);

  return {
    push(op) {
      pushStmt().run({ ...op, payload: JSON.stringify(op.payload) });
      return op.id;
    },

    getAll() {
      const cutoff = new Date(Date.now() - OFFLINE_TTL_MS).toISOString();
      return getDb()
        .prepare('SELECT * FROM sync_queue_local WHERE synced = 0 AND client_ts > ? ORDER BY client_ts')
        .all(cutoff)
        .map(r => ({ ...r, payload: JSON.parse(r.payload) }));
    },

    remove(ids) {
      if (!ids.length) return;
      const stmt = getDb().prepare('UPDATE sync_queue_local SET synced = 1 WHERE id = ?');
      getDb().transaction(list => list.forEach(id => stmt.run(id)))(ids);
    },

    clear() {
      getDb().prepare('DELETE FROM sync_queue_local').run();
    },
  };
}

module.exports = { initLocalDb, getDb, insertVente, getVentesNonSynchro, marquerSynchro, createSdkAdapter };
