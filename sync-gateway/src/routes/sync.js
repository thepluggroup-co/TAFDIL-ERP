const express = require('express');
const { body, query } = require('express-validator');
const { rateLimit } = require('../middleware/rateLimiter');
const { validate } = require('../../backend/src/middleware/errorHandler');
const { requireAuth } = require('../../backend/src/middleware/auth');
const syncService = require('../services/syncService');

const router = express.Router();

// Toutes les routes sync requièrent auth
router.use(requireAuth);

// ── POST /sync/push ─────────────────────────────────────────
router.post(
  '/push',
  rateLimit(50),
  [
    body('operations').isArray({ min: 1 }),
    body('operations.*.id').isUUID(),
    body('operations.*.table_cible').notEmpty(),
    body('operations.*.operation').isIn(['INSERT', 'UPDATE', 'DELETE']),
    body('operations.*.payload').isObject(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const result = await syncService.pushSync(req.user.id, req.body.operations);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /sync/pull ──────────────────────────────────────────
router.get(
  '/pull',
  rateLimit(100),
  [query('since').optional().isISO8601()],
  validate,
  async (req, res, next) => {
    try {
      const tables = req.query.tables
        ? req.query.tables.split(',')
        : undefined;
      const result = await syncService.pullSync(req.query.since, tables);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
