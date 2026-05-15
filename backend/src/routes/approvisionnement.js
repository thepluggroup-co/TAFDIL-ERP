const express = require('express');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/errorHandler');
const { requireRole } = require('../middleware/auth');
const appro = require('../services/approvisionnementService');

const router = express.Router();

// GET /api/approvisionnement/suggestions — produits à réapprovisionner
router.get('/suggestions',
  query('urgence').optional().isIn(['URGENT','CRITIQUE','A_COMMANDER']),
  validate,
  async (req, res, next) => {
    try {
      const data = await appro.getSuggestions(req.query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/approvisionnement/fournisseurs — liste des fournisseurs
router.get('/fournisseurs', async (req, res, next) => {
  try {
    const data = await appro.listeFournisseurs();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/approvisionnement/commande — créer une commande fournisseur
router.post('/commande',
  requireRole('DG', 'ADMIN', 'MAGASINIER'),
  body('fournisseur_id').isUUID(),
  body('lignes').isArray({ min: 1 }),
  body('lignes.*.produit_id').matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  body('lignes.*.quantite_commandee').isFloat({ min: 0.001 }),
  body('lignes.*.prix_unitaire_xaf').isFloat({ min: 0 }),
  validate,
  async (req, res, next) => {
    try {
      const cmd = await appro.creerCommandeAchat(req.body, req.user.id);
      res.status(201).json(cmd);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/approvisionnement/commande/:id/pdf — PDF bon de commande
router.get('/commande/:id/pdf',
  param('id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const pdf = await appro.genererPDFCommandeAchat(req.params.id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="commande-${req.params.id}.pdf"`);
      res.send(pdf);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/approvisionnement/commande/:id/statut — mise à jour statut
router.patch('/commande/:id/statut',
  param('id').isUUID(),
  body('statut').isIn(['ENVOYE','CONFIRME','EN_LIVRAISON','RECEPTIONNE','ANNULE']),
  validate,
  async (req, res, next) => {
    try {
      const data = await appro.mettreAJourStatutCommande(req.params.id, req.body.statut);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/approvisionnement/commandes — liste des commandes achat
router.get('/commandes', async (req, res, next) => {
  try {
    const supabase = require('../config/supabase');
    const { statut, fournisseur_id } = req.query;
    let q = supabase
      .from('commandes_achat')
      .select(`
        *, fournisseur:fournisseur_id (nom),
        lignes:commandes_achat_lignes (count)
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (statut) q = q.eq('statut', statut);
    if (fournisseur_id) q = q.eq('fournisseur_id', fournisseur_id);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
