const express = require('express');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/errorHandler');
const { requireRole } = require('../middleware/auth');
const qc = require('../services/qualiteService');
const ficheQcPdfService = require('../services/ficheQcPdfService');

const router = express.Router();

// GET /api/qualite/criteres/:type_produit — critères QC d'un type produit
router.get('/criteres/:type_produit', async (req, res, next) => {
  try {
    const data = await qc.getCriteresType(req.params.type_produit);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/qualite/fiches — créer une fiche de contrôle qualité
router.post('/fiches',
  body('of_id').isUUID(),
  body('criteres_verifies').isArray(),
  validate,
  async (req, res, next) => {
    try {
      const { of_id, criteres_verifies, defauts_constates, actions_correctives, photos_controle } = req.body;
      const data = await qc.creerFicheQC({
        of_id,
        technicien_qc_id: req.user.id,
        criteres_verifies,
        defauts_constates,
        actions_correctives,
        photos_controle,
      });
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/qualite/fiches/:id/valider — valider/rejeter une fiche (DG)
router.patch('/fiches/:id/valider',
  requireRole('DG', 'ADMIN'),
  param('id').isUUID(),
  body('decision').isIn(['VALIDE', 'RETOUCHE', 'REJET']),
  validate,
  async (req, res, next) => {
    try {
      const data = await qc.validerFicheQC(req.params.id, req.body.decision, req.user.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/qualite/retouches — créer une retouche
router.post('/retouches',
  body('fiche_qc_id').isUUID(),
  body('of_id').isUUID(),
  body('type_defaut').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const { fiche_qc_id, of_id, type_defaut, temps_retouche_h } = req.body;
      const data = await qc.creerRetouche({
        fiche_qc_id,
        of_id,
        type_defaut,
        temps_retouche_h,
        technicien_id: req.user.id,
      });
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/qualite/taux-conformite — statistiques QC
router.get('/taux-conformite',
  query('date_debut').optional().isISO8601(),
  query('date_fin').optional().isISO8601(),
  validate,
  async (req, res, next) => {
    try {
      const data = await qc.getTauxConformite(req.query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/qualite/fiches — liste des fiches QC
router.get('/fiches', async (req, res, next) => {
  try {
    const supabase = require('../config/supabase');
    const { decision, limit } = req.query;
    let q = supabase
      .from('fiches_controle_qualite')
      .select(`
        *, of:of_id (reference, type_produit, statut),
        technicien_qc_id
      `)
      .order('date_controle', { ascending: false })
      .limit(parseInt(limit || 50));

    if (decision) q = q.eq('decision', decision);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/qualite/fiches/:id/pdf — PDF fiche de contrôle qualité
router.get('/fiches/:id/pdf',
  param('id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const pdfBuf = await ficheQcPdfService.genererFicheQcPDF(req.params.id);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="QC-${req.params.id}.pdf"`,
        'Content-Length': pdfBuf.length,
      });
      res.send(pdfBuf);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
