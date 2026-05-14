const express = require('express');
const { param, query } = require('express-validator');
const { validate } = require('../middleware/errorHandler');
const tracabilite = require('../services/tracabiliteService');

const router = express.Router();

// GET /api/tracabilite/produit-fini/:id — traçabilité complète d'un produit fini
router.get('/produit-fini/:id',
  param('id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const data = await tracabilite.getTracabiliteProduitFini(req.params.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/tracabilite/rentabilite/:commande_id — rentabilité réelle d'une commande
router.get('/rentabilite/:commande_id',
  param('commande_id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const data = await tracabilite.getRentabiliteCommande(req.params.commande_id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/tracabilite/matiere/:produit_id — historique consommation d'une matière
router.get('/matiere/:produit_id',
  param('produit_id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const data = await tracabilite.getHistoriqueMatiere(req.params.produit_id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/tracabilite/rentabilite-globale — toutes commandes
router.get('/rentabilite-globale',
  query('date_debut').optional().isISO8601(),
  query('date_fin').optional().isISO8601(),
  validate,
  async (req, res, next) => {
    try {
      const data = await tracabilite.getRentabiliteGlobale(req.query);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
