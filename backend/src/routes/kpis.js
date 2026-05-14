const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const kpis = require('../services/kpisService');

// Dashboard global DG
router.get('/dashboard', requireAuth, requireRole('DG'), async (req, res) => {
  try { res.json(await kpis.getDashboardGlobal()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Pilotage chantiers
router.get('/chantiers', requireAuth, requireRole('DG','SECRETAIRE','CHEF_ATELIER'), async (req, res) => {
  try { res.json(await kpis.getPilotageChantiers(req.query)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Alertes prédictives stock
router.get('/alertes-stock', requireAuth, async (req, res) => {
  try { res.json(await kpis.getAlertesPredictives()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Trésorerie prévisionnelle
router.get('/tresorerie', requireAuth, requireRole('DG'), async (req, res) => {
  try { res.json(await kpis.getTresoreriePrevisionnelle()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Performance atelier
router.get('/performance-atelier', requireAuth, requireRole('DG','CHEF_ATELIER'), async (req, res) => {
  try { res.json(await kpis.getPerformanceAtelier()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
