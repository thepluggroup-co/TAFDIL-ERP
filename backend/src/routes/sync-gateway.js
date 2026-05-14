'use strict';

/**
 * Routes sync — délégation au sync-gateway externe (port 3001).
 * Ce fichier permet à l'API Gateway de servir les routes /sync/*
 * pour les clients ERP natifs (Electron, Expo) qui n'ont qu'une seule URL.
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const supabase = require('../config/supabase');

const router = express.Router();
const OFFLINE_TTL_MS = 72 * 60 * 60 * 1000;

router.use(requireAuth);

// POST /sync/push — ERP natif envoie opérations offline
router.post('/push', async (req, res, next) => {
  try {
    const { operations } = req.body;
    if (!Array.isArray(operations) || operations.length === 0) {
      return res.status(400).json({ success: false, message: 'operations[] requis' });
    }

    const results = [];
    const cutoff = new Date(Date.now() - OFFLINE_TTL_MS).toISOString();

    for (const op of operations) {
      if (!op.id || !op.table_cible || !op.operation || !op.payload) {
        results.push({ id: op.id, status: 'REJECTED', reason: 'Champs manquants' });
        continue;
      }
      if (op.client_ts < cutoff) {
        results.push({ id: op.id, status: 'REJECTED', reason: 'Opération expirée (>72h)' });
        continue;
      }

      try {
        // Idempotence — vérifie si déjà traitée
        const { data: existing } = await supabase
          .from('sync_queue')
          .select('id, synced')
          .eq('id', op.id)
          .maybeSingle();

        if (existing?.synced) {
          results.push({ id: op.id, status: 'ALREADY_SYNCED' });
          continue;
        }

        // Applique l'opération — LAST_WRITE_WINS
        let error;
        if (op.operation === 'INSERT' || op.operation === 'POST') {
          ({ error } = await supabase.from(op.table_cible).upsert({
            ...op.payload,
            updated_at: new Date().toISOString(),
          }));
        } else if (op.operation === 'UPDATE') {
          ({ error } = await supabase.from(op.table_cible)
            .update({ ...op.payload, updated_at: new Date().toISOString() })
            .eq('id', op.payload.id));
        } else if (op.operation === 'DELETE') {
          ({ error } = await supabase.from(op.table_cible).delete().eq('id', op.payload.id));
        }

        if (error) throw error;

        // Marque comme traitée
        await supabase.from('sync_queue').upsert({
          id: op.id, table_cible: op.table_cible, operation: op.operation,
          payload: op.payload, client_ts: op.client_ts, synced: true,
          synced_at: new Date().toISOString(),
        });

        results.push({ id: op.id, status: 'OK' });
      } catch (e) {
        results.push({ id: op.id, status: 'ERROR', reason: e.message });
      }
    }

    const ok = results.filter(r => r.status === 'OK' || r.status === 'ALREADY_SYNCED').length;
    res.json({
      success: true,
      total: results.length,
      ok,
      errors: results.length - ok,
      results,
    });
  } catch (err) { next(err); }
});

// GET /sync/pull — ERP natif tire les changements récents
router.get('/pull', async (req, res, next) => {
  try {
    const since = req.query.since || new Date(0).toISOString();
    const tables = req.query.tables
      ? req.query.tables.split(',')
      : ['produits', 'ventes_comptoir', 'produits_finis', 'commandes_produits_finis'];

    const deltas = {};
    for (const table of tables) {
      const { data } = await supabase
        .from(table)
        .select('*')
        .gt('updated_at', since)
        .limit(500);
      deltas[table] = data || [];
    }

    res.json({ success: true, server_ts: new Date().toISOString(), deltas });
  } catch (err) { next(err); }
});

module.exports = router;
