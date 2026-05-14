const express = require('express');
const { body, query, param } = require('express-validator');
const { validate } = require('../middleware/errorHandler');
const { requireRole } = require('../middleware/auth');
const mrp = require('../services/mrpService');

const router = express.Router();

// POST /api/mrp/exploser-bom — explosion BOM d'un OF
router.post('/exploser-bom',
  body('of_id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const result = await mrp.exploserBOM(req.body.of_id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/mrp/planning — planning atelier sur une période
router.get('/planning',
  query('date_debut').optional().isISO8601(),
  query('date_fin').optional().isISO8601(),
  validate,
  async (req, res, next) => {
    try {
      const data = await mrp.getPlanning(req.query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/mrp/ofs — liste des ordres de fabrication
router.get('/ofs',
  async (req, res, next) => {
    try {
      const { statut, technicien_id, date_debut, date_fin, page, limit } = req.query;
      const data = await mrp.listeOF({ statut, technicien_id, date_debut, date_fin,
        page: parseInt(page || 1), limit: parseInt(limit || 20) });
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/mrp/ofs/:id/besoins — besoins matières d'un OF
router.get('/ofs/:id/besoins',
  param('id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const data = await mrp.getBesoinsOF(req.params.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/mrp/ofs/:id/statut — changer statut d'un OF
router.patch('/ofs/:id/statut',
  param('id').isUUID(),
  body('statut').isIn(['PLANIFIE','EN_ATTENTE_MATIERE','EN_COURS','SUSPENDU','TERMINE','ANNULE']),
  validate,
  async (req, res, next) => {
    try {
      const data = await mrp.mettreAJourStatutOF(req.params.id, req.body.statut, req.user.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/mrp/ofs/:id/assigner — assigner un technicien
router.patch('/ofs/:id/assigner',
  requireRole('DG', 'ADMIN', 'CHEF_ATELIER'),
  param('id').isUUID(),
  body('technicien_id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const data = await mrp.assignerTechnicien(req.params.id, req.body.technicien_id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/mrp/nomenclatures — liste des BOM
router.get('/nomenclatures', async (req, res, next) => {
  try {
    const supabase = require('../config/supabase');
    const { data, error } = await supabase
      .from('nomenclatures_types')
      .select('*, lignes:nomenclatures_lignes(*)')
      .eq('actif', true)
      .order('type_produit');
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/mrp/nomenclatures/:id/lignes — ajouter une ligne BOM
router.post('/nomenclatures/:id/lignes',
  requireRole('DG', 'ADMIN'),
  param('id').isUUID(),
  body('unite').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const supabase = require('../config/supabase');
      const { data, error } = await supabase
        .from('nomenclatures_lignes')
        .insert({ nomenclature_id: req.params.id, ...req.body })
        .select()
        .single();
      if (error) throw new Error(error.message);
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
