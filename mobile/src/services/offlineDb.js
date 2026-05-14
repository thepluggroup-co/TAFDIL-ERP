import * as SQLite from 'expo-sqlite';

let db = null;

export async function initOfflineDb() {
  db = await SQLite.openDatabaseAsync('tafdil-offline.db');

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS ventes_offline (
      id           TEXT PRIMARY KEY,
      payload      TEXT NOT NULL,
      date_vente   TEXT DEFAULT (datetime('now')),
      synced       INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bons_sortie_offline (
      id           TEXT PRIMARY KEY,
      payload      TEXT NOT NULL,
      created_at   TEXT DEFAULT (datetime('now')),
      synced       INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_ventes_synced    ON ventes_offline(synced);
    CREATE INDEX IF NOT EXISTS idx_bons_synced      ON bons_sortie_offline(synced);
  `);

  return db;
}

export async function insertVenteOffline(vente) {
  if (!db) throw new Error('DB non initialisée');
  await db.runAsync(
    'INSERT OR REPLACE INTO ventes_offline (id, payload) VALUES (?, ?)',
    [vente.id, JSON.stringify(vente)]
  );
}

export async function getVentesNonSynchro() {
  if (!db) return [];
  const rows = await db.getAllAsync('SELECT * FROM ventes_offline WHERE synced = 0');
  return rows.map(r => ({ ...r, payload: JSON.parse(r.payload) }));
}

export async function marquerSynchro(table, ids) {
  if (!db || !ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE ${table} SET synced = 1 WHERE id IN (${placeholders})`,
    ids
  );
}

/**
 * Crée un StorageAdapter compatible @tafdil/sdk à injecter dans TafdilClient.
 * Doit être appelé après initOfflineDb().
 *
 * @example
 *   await initOfflineDb();
 *   const adapter = await createSdkAdapter();
 *   const client = new TafdilClient({ ..., storageAdapter: adapter });
 */
export async function createSdkAdapter() {
  if (!db) throw new Error("DB non initialisée — appelez initOfflineDb() d'abord");

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_queue_local (
      id          TEXT PRIMARY KEY,
      table_cible TEXT NOT NULL,
      operation   TEXT NOT NULL,
      payload     TEXT NOT NULL,
      client_ts   TEXT DEFAULT (datetime('now')),
      synced      INTEGER DEFAULT 0,
      retries     INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_sync_queue_synced ON sync_queue_local(synced);
  `);

  const OFFLINE_TTL_MS = 72 * 60 * 60 * 1000;

  return {
    async push(op) {
      await db.runAsync(
        'INSERT OR REPLACE INTO sync_queue_local (id, table_cible, operation, payload, client_ts, retries) VALUES (?, ?, ?, ?, ?, ?)',
        [op.id, op.table_cible, op.operation, JSON.stringify(op.payload), op.client_ts, op.retries ?? 0]
      );
      return op.id;
    },

    async getAll() {
      const cutoff = new Date(Date.now() - OFFLINE_TTL_MS).toISOString();
      const rows = await db.getAllAsync(
        'SELECT * FROM sync_queue_local WHERE synced = 0 AND client_ts > ? ORDER BY client_ts',
        [cutoff]
      );
      return rows.map(r => ({ ...r, payload: JSON.parse(r.payload) }));
    },

    async remove(ids) {
      if (!ids.length) return;
      const placeholders = ids.map(() => '?').join(',');
      await db.runAsync(
        `UPDATE sync_queue_local SET synced = 1 WHERE id IN (${placeholders})`,
        ids
      );
    },

    async clear() {
      await db.runAsync('DELETE FROM sync_queue_local');
    },
  };
}
