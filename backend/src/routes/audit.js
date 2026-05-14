const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const audit = require('../services/auditService');

// Middleware : toutes les routes audit sont réservées au DG
router.use(requireAuth, requireRole('DG'));

// Consulter le log
router.get('/log', async (req, res) => {
  try { res.json(await audit.getAuditLog(req.query)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Statistiques 30 derniers jours
router.get('/stats', async (req, res) => {
  try { res.json(await audit.getStats()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Export CSV
router.get('/export-csv', async (req, res) => {
  try {
    const csv = await audit.exportCSV(req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit_log.csv"');
    res.send('﻿' + csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Purge manuelle (> 365 jours)
router.delete('/purger', async (req, res) => {
  try { res.json(await audit.purgerAnciens()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
