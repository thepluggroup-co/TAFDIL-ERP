const express = require('express');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/errorHandler');
const { requireRole } = require('../middleware/auth');
const maintenance = require('../services/maintenanceService');

const router = express.Router();

// GET /api/maintenance/alertes — alertes maintenance depuis la vue
router.get('/alertes', async (req, res, next) => {
  try {
    const data = await maintenance.getAlertes();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/maintenance/equipements — liste équipements avec plans
router.get('/equipements', async (req, res, next) => {
  try {
    const data = await maintenance.getEquipements();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/maintenance/interventions — démarrer une intervention
router.post('/interventions',
  body('equipement_id').isUUID(),
  body('type').isIn(['PREVENTIVE', 'CORRECTIVE']),
  validate,
  async (req, res, next) => {
    try {
      const data = await maintenance.creerIntervention(req.body);
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/maintenance/interventions/:id/cloturer — clôturer une intervention
router.patch('/interventions/:id/cloturer',
  param('id').isUUID(),
  body('actions_realisees').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const data = await maintenance.clotureIntervention(req.params.id, req.body);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/maintenance/couts — coûts de maintenance agrégés
router.get('/couts',
  query('date_debut').optional().isISO8601(),
  query('date_fin').optional().isISO8601(),
  validate,
  async (req, res, next) => {
    try {
      const data = await maintenance.getCoutsMaintenance(req.query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/maintenance/plans — créer ou mettre à jour un plan préventif
router.post('/plans',
  requireRole('DG', 'ADMIN'),
  body('equipement_id').isUUID(),
  body('frequence_jours').isInt({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const data = await maintenance.upsertPlanMaintenance(req.body);
      res.status(req.body.id ? 200 : 201).json(data);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/maintenance/interventions — historique des interventions
router.get('/interventions', async (req, res, next) => {
  try {
    const supabase = require('../config/supabase');
    const { equipement_id, type } = req.query;
    let q = supabase
      .from('interventions_maintenance')
      .select(`
        *, equipement:equipement_id (nom, localisation),
        plan:plan_id (type, description_operations)
      `)
      .order('date_debut', { ascending: false })
      .limit(100);

    if (equipement_id) q = q.eq('equipement_id', equipement_id);
    if (type) q = q.eq('type', type);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
