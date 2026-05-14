const express = require('express');
const { body, query } = require('express-validator');
const { validate } = require('../middleware/errorHandler');
const { requireRole, requireCronKey } = require('../middleware/auth');
const notif = require('../services/notificationService');

const router = express.Router();

// GET /api/notifications — notifications de l'utilisateur courant
router.get('/',
  query('non_lues_seulement').optional().isBoolean(),
  validate,
  async (req, res, next) => {
    try {
      const { non_lues_seulement, limit } = req.query;
      const data = await notif.getNotifications(req.user.id, {
        non_lues_seulement: non_lues_seulement === 'true',
        limit: parseInt(limit || 30),
      });
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/notifications/marquer-lues — marquer comme lues
router.post('/marquer-lues',
  async (req, res, next) => {
    try {
      await notif.marquerLues(req.user.id, req.body.ids || []);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/notifications/notifier — envoyer une notification ciblée (DG/admin)
router.post('/notifier',
  requireRole('DG', 'ADMIN'),
  body('user_id').isUUID(),
  body('type').notEmpty(),
  body('titre').notEmpty(),
  body('message').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const n = await notif.notifier(req.body);
      res.status(201).json(n);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/notifications/push-token — enregistrer un token push
router.post('/push-token',
  body('token').notEmpty(),
  body('platform').isIn(['android', 'ios', 'web']),
  validate,
  async (req, res, next) => {
    try {
      const supabase = require('../config/supabase');
      await supabase.from('user_push_tokens').upsert(
        { user_id: req.user.id, token: req.body.token, platform: req.body.platform },
        { onConflict: 'user_id,token' }
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/notifications/preferences — mettre à jour les préférences
router.put('/preferences',
  async (req, res, next) => {
    try {
      const supabase = require('../config/supabase');
      const { data, error } = await supabase
        .from('user_notification_prefs')
        .upsert(
          { user_id: req.user.id, ...req.body, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
        .select()
        .single();
      if (error) throw new Error(error.message);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/notifications/cron/stock-critique — appelé par cron (Header: X-Cron-Key)
router.post('/cron/stock-critique',
  requireCronKey,
  async (req, res, next) => {
    try {
      const result = await notif.alertesStockCritique();
      res.json({ notifiees: result.length });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/notifications/cron/maintenance — appelé par cron (Header: X-Cron-Key)
router.post('/cron/maintenance',
  requireCronKey,
  async (req, res, next) => {
    try {
      const result = await notif.alertesMaintenance();
      res.json({ notifiees: result.length });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
