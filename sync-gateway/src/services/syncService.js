const supabase = require('../../backend/src/config/supabase');

const OFFLINE_TTL_H = 72;

/**
 * Client envoie sa file d'opérations hors-ligne.
 * Stratégie : LAST_WRITE_WINS sur timestamp serveur.
 *
 * @param {string}  userId
 * @param {Array}   operations  [{id, table_cible, operation, payload, client_ts}]
 */
async function pushSync(userId, operations) {
  const results = [];
  const cutoff = new Date(Date.now() - OFFLINE_TTL_H * 3600_000).toISOString();

  for (const op of operations) {
    // Rejeter les opérations trop anciennes
    if (op.client_ts && op.client_ts < cutoff) {
      results.push({ id: op.id, status: 'REJECTED', reason: `Opération expirée (> ${OFFLINE_TTL_H}h)` });
      continue;
    }

    try {
      // Vérifie idempotence : même id déjà traité ?
      const { data: existing } = await supabase
        .from('sync_queue')
        .select('id, synced_at')
        .eq('id', op.id)
        .maybeSingle();

      if (existing?.synced_at) {
        results.push({ id: op.id, status: 'ALREADY_SYNCED' });
        continue;
      }

      // Appliquer l'opération sur la table cible
      let error = null;
      const { operation, table_cible, payload } = op;

      if (operation === 'INSERT') {
        ({ error } = await supabase.from(table_cible).insert(payload));
      } else if (operation === 'UPDATE') {
        ({ error } = await supabase.from(table_cible).update(payload).eq('id', payload.id));
      } else if (operation === 'DELETE') {
        ({ error } = await supabase.from(table_cible).delete().eq('id', payload.id));
      } else {
        results.push({ id: op.id, status: 'ERROR', reason: `Opération inconnue : ${operation}` });
        continue;
      }

      if (error) throw new Error(error.message);

      // Marquer comme synchronisée
      await supabase.from('sync_queue').upsert({
        id: op.id,
        table_cible,
        operation,
        payload,
        user_id: userId,
        client_ts: op.client_ts,
        synced_at: new Date().toISOString(),
        retries: 0,
      });

      results.push({ id: op.id, status: 'OK' });
    } catch (err) {
      await supabase.from('sync_queue').upsert({
        id: op.id,
        table_cible: op.table_cible,
        operation: op.operation,
        payload: op.payload,
        user_id: userId,
        client_ts: op.client_ts,
        last_error: err.message,
        retries: (op.retries || 0) + 1,
      });
      results.push({ id: op.id, status: 'ERROR', reason: err.message });
    }
  }

  const ok = results.filter(r => r.status === 'OK').length;
  return { total: operations.length, ok, errors: results.filter(r => r.status === 'ERROR').length, results };
}

/**
 * Client récupère tous les changements depuis son dernier pull.
 * Retourne les deltas par table.
 *
 * @param {string} since  ISO timestamp du dernier pull client
 * @param {string[]} tables  Tables à surveiller
 */
async function pullSync(since, tables = ['produits', 'ventes_comptoir', 'produits_finis', 'commandes_produits_finis']) {
  const sinceTs = since || new Date(0).toISOString();
  const deltas = {};

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .gt('updated_at', sinceTs)
      .order('updated_at', { ascending: true })
      .limit(500);

    if (!error) deltas[table] = data || [];
  }

  return {
    server_ts: new Date().toISOString(),
    deltas,
  };
}

module.exports = { pushSync, pullSync };
