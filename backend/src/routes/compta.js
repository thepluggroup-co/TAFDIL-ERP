const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const compta = require('../services/comptaService');

// Grand livre
router.get('/grand-livre', requireAuth, requireRole('DG','SECRETAIRE'), async (req, res) => {
  try { res.json(await compta.getGrandLivre(req.query)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Balance SYSCOHADA
router.get('/balance', requireAuth, requireRole('DG','SECRETAIRE'), async (req, res) => {
  try { res.json(await compta.getBalance(req.query)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// États financiers (compte de résultat + bilan simplifié)
router.get('/etats-financiers', requireAuth, requireRole('DG'), async (req, res) => {
  try {
    const exercice = parseInt(req.query.exercice) || new Date().getFullYear();
    res.json(await compta.getEtatsFinanciers(exercice));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Export Sage CSV
router.get('/sage-export', requireAuth, requireRole('DG','SECRETAIRE'), async (req, res) => {
  try {
    const csv = await compta.exportSageCSV(req.query);
    const fn = `tafdil_compta_${req.query.exercice || new Date().getFullYear()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fn}"`);
    res.send('﻿' + csv); // BOM for Excel
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Journaux disponibles
router.get('/journaux', requireAuth, async (req, res) => {
  try { res.json(await compta.getJournaux()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Écriture manuelle
router.post('/ecritures', requireAuth, requireRole('DG','SECRETAIRE'), async (req, res) => {
  try { res.status(201).json(await compta.creerEcritureManuelle(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Valider écriture
router.patch('/ecritures/:id/valider', requireAuth, requireRole('DG'), async (req, res) => {
  try { res.json(await compta.validerEcriture(req.params.id, req.user.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
