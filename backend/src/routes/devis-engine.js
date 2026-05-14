const express = require('express');
const { body, query } = require('express-validator');
const { validate } = require('../middleware/errorHandler');
const { requireRole } = require('../middleware/auth');
const { estimerDevis, creerDevisAuto, historiqueSimilaires } = require('../services/devisEngineService');

const router = express.Router();

// POST /api/devis/estimer — estimation rapide sans créer de devis
router.post('/estimer',
  body('type_produit').notEmpty(),
  body('largeur_m').isFloat({ min: 0.3, max: 20 }),
  body('hauteur_m').isFloat({ min: 0.5, max: 10 }),
  body('materiau').notEmpty(),
  body('finition').notEmpty(),
  body('quantite').optional().isInt({ min: 1, max: 100 }),
  validate,
  async (req, res, next) => {
    try {
      const result = await estimerDevis(req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/devis/creer-auto — crée un devis en base depuis une estimation
router.post('/creer-auto',
  body('type_produit').notEmpty(),
  body('largeur_m').isFloat({ min: 0.3 }),
  body('hauteur_m').isFloat({ min: 0.5 }),
  body('materiau').notEmpty(),
  body('finition').notEmpty(),
  body('client_id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const { client_id, ...params } = req.body;
      const result = await creerDevisAuto(params, client_id, req.user.id);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/devis/historique-similaires — devis passés proches dimensionnellement
router.get('/historique-similaires',
  query('type_produit').notEmpty(),
  query('largeur_m').isFloat({ min: 0.1 }),
  query('hauteur_m').isFloat({ min: 0.1 }),
  validate,
  async (req, res, next) => {
    try {
      const data = await historiqueSimilaires(req.query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/devis/tarifs — liste les tarifs de base (lecture seule)
router.get('/tarifs', async (req, res, next) => {
  try {
    const supabase = require('../config/supabase');
    const { data, error } = await supabase
      .from('tarifs_base')
      .select('*')
      .eq('actif', true)
      .order('type_produit');
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/devis/tarifs/:id — mise à jour tarif (DG seulement)
router.put('/tarifs/:id',
  requireRole('DG', 'ADMIN'),
  async (req, res, next) => {
    try {
      const supabase = require('../config/supabase');
      const { data, error } = await supabase
        .from('tarifs_base')
        .update({ ...req.body, updated_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
