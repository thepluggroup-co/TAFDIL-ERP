const express = require('express');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/errorHandler');
const { requireRole } = require('../middleware/auth');
const employe = require('../services/employeService');
const pointage = require('../services/pointageService');

const router = express.Router();

// ── EMPLOYÉS ──────────────────────────────────────────────────────────────────

// GET /api/rh/employes
router.get('/employes', async (req, res, next) => {
  try {
    const { departement, statut, type_contrat, page, limit } = req.query;
    const data = await employe.listeEmployes({
      departement, statut, type_contrat,
      page: parseInt(page || 1),
      limit: parseInt(limit || 30),
    });
    res.json(data);
  } catch (err) { next(err); }
});

// POST /api/rh/employes
router.post('/employes',
  requireRole('DG', 'ADMIN'),
  body('nom').notEmpty(),
  body('prenom').notEmpty(),
  body('poste').notEmpty(),
  body('departement').notEmpty(),
  body('type_contrat').isIn(['CDI','CDD','STAGE','SOUS_TRAITANT']),
  body('salaire_base_xaf').isFloat({ min: 0 }),
  validate,
  async (req, res, next) => {
    try {
      const data = await employe.creerEmploye(req.body, req.user.id);
      res.status(201).json(data);
    } catch (err) { next(err); }
  }
);

// GET /api/rh/employes/:id
router.get('/employes/:id',
  param('id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const data = await employe.getEmploye(req.params.id);
      res.json(data);
    } catch (err) { next(err); }
  }
);

// PUT /api/rh/employes/:id
router.put('/employes/:id',
  requireRole('DG', 'ADMIN'),
  param('id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const data = await employe.mettreAJourEmploye(req.params.id, req.body, req.user.id);
      res.json(data);
    } catch (err) { next(err); }
  }
);

// GET /api/rh/employes/:id/historique
router.get('/employes/:id/historique',
  param('id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const data = await employe.getHistorique(req.params.id);
      res.json(data);
    } catch (err) { next(err); }
  }
);

// ── CONGÉS ────────────────────────────────────────────────────────────────────

// POST /api/rh/conges
router.post('/conges',
  body('employe_id').isUUID(),
  body('type').isIn(['ANNUEL','MALADIE','MATERNITE','SANS_SOLDE','EXCEPTIONNEL']),
  body('date_debut').isISO8601(),
  body('date_fin').isISO8601(),
  validate,
  async (req, res, next) => {
    try {
      const data = await employe.demanderConge(req.body);
      res.status(201).json(data);
    } catch (err) { next(err); }
  }
);

// PUT /api/rh/conges/:id/valider
router.put('/conges/:id/valider',
  requireRole('DG', 'ADMIN'),
  param('id').isUUID(),
  body('statut').isIn(['VALIDE','REFUSE']),
  validate,
  async (req, res, next) => {
    try {
      const data = await employe.validerConge(req.params.id, req.body.statut, req.user.id);
      res.json(data);
    } catch (err) { next(err); }
  }
);

// GET /api/rh/conges — liste des congés
router.get('/conges', async (req, res, next) => {
  try {
    const supabase = require('../config/supabase');
    const { employe_id, statut } = req.query;
    let q = supabase
      .from('conges')
      .select(`
        *, employe:employe_id (matricule, nom, prenom, poste)
      `)
      .order('date_debut', { ascending: false })
      .limit(50);
    if (employe_id) q = q.eq('employe_id', employe_id);
    if (statut) q = q.eq('statut', statut);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) { next(err); }
});

// ── ÉVALUATIONS ───────────────────────────────────────────────────────────────

// POST /api/rh/evaluations
router.post('/evaluations',
  requireRole('DG', 'ADMIN'),
  body('employe_id').isUUID(),
  body('periode').isIn(['TRIM1','TRIM2','TRIM3','TRIM4','ANNUEL']),
  body('criteres').isArray({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const data = await employe.creerEvaluation({
        ...req.body,
        evaluateur_id: req.user.id,
      });
      res.status(201).json(data);
    } catch (err) { next(err); }
  }
);

// GET /api/rh/evaluations/:employe_id — historique évaluations
router.get('/evaluations/:employe_id',
  param('employe_id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const supabase = require('../config/supabase');
      const { data, error } = await supabase
        .from('evaluations')
        .select('*')
        .eq('employe_id', req.params.employe_id)
        .order('annee', { ascending: false })
        .order('periode');
      if (error) throw new Error(error.message);
      res.json(data);
    } catch (err) { next(err); }
  }
);

// ── POINTAGES ─────────────────────────────────────────────────────────────────

// POST /api/rh/pointage/entree
router.post('/pointage/entree',
  body('employe_id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const { employe_id, mode } = req.body;
      const data = await pointage.enregistrerArrivee(employe_id, mode);
      res.json(data);
    } catch (err) { next(err); }
  }
);

// POST /api/rh/pointage/sortie
router.post('/pointage/sortie',
  body('employe_id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const data = await pointage.enregistrerSortie(req.body.employe_id);
      res.json(data);
    } catch (err) { next(err); }
  }
);

// GET /api/rh/pointage/mois — récap mensuel
router.get('/pointage/mois',
  query('employe_id').optional().isUUID(),
  query('annee').isInt({ min: 2020 }),
  query('mois').isInt({ min: 1, max: 12 }),
  validate,
  async (req, res, next) => {
    try {
      const { employe_id, annee, mois } = req.query;
      if (employe_id) {
        const data = await pointage.getRecapMensuel(employe_id, parseInt(annee), parseInt(mois));
        res.json(data);
      } else {
        const data = await pointage.getRecapMensuelTous(parseInt(annee), parseInt(mois));
        res.json(data);
      }
    } catch (err) { next(err); }
  }
);

// POST /api/rh/pointage/manuel — saisie manuelle superviseur
router.post('/pointage/manuel',
  requireRole('DG', 'ADMIN', 'CHEF_ATELIER'),
  body('employe_id').isUUID(),
  body('date').isISO8601(),
  validate,
  async (req, res, next) => {
    try {
      const data = await pointage.pointageManuel({ ...req.body, valide_par: req.user.id });
      res.json(data);
    } catch (err) { next(err); }
  }
);

// ── ALERTES RH ────────────────────────────────────────────────────────────────

// GET /api/rh/alertes-rh
router.get('/alertes-rh', async (req, res, next) => {
  try {
    const data = await employe.getAlertesRH();
    res.json(data);
  } catch (err) { next(err); }
});

// POST /api/rh/absences
router.post('/absences',
  body('employe_id').isUUID(),
  body('date').isISO8601(),
  body('type').isIn(['NON_JUSTIFIEE','AUTORISEE','MALADIE']),
  validate,
  async (req, res, next) => {
    try {
      const supabase = require('../config/supabase');
      const { data, error } = await supabase
        .from('absences')
        .insert({ ...req.body, cree_par: req.user.id })
        .select()
        .single();
      if (error) throw new Error(error.message);
      res.status(201).json(data);
    } catch (err) { next(err); }
  }
);

// POST /api/rh/primes — ajouter une prime mensuelle
router.post('/primes',
  requireRole('DG', 'ADMIN'),
  body('employe_id').isUUID(),
  body('annee').isInt({ min: 2020 }),
  body('mois').isInt({ min: 1, max: 12 }),
  body('type').isIn(['TRANSPORT','LOGEMENT','PERFORMANCE','ANCIENNETE','ASTREINTE','REPRESENTATION','AUTRE']),
  body('montant_xaf').isFloat({ min: 0 }),
  validate,
  async (req, res, next) => {
    try {
      const supabase = require('../config/supabase');
      const { data, error } = await supabase
        .from('primes_mensuelles')
        .upsert({ ...req.body, cree_par: req.user.id }, { onConflict: 'employe_id,annee,mois,type' })
        .select()
        .single();
      if (error) throw new Error(error.message);
      res.status(201).json(data);
    } catch (err) { next(err); }
  }
);

module.exports = router;
