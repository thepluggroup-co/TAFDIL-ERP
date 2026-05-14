const express = require('express');
const { body, param } = require('express-validator');
const { validate } = require('../middleware/errorHandler');
const fidelite = require('../services/fideliteService');

const router = express.Router();

// POST /api/fidelite/identifier — retrouver ou créer un client fidélité
router.post('/identifier',
  body('telephone').matches(/^[+\d]{8,15}$/),
  validate,
  async (req, res, next) => {
    try {
      const { telephone, prenom, nom, client_id } = req.body;
      let client = await fidelite.identifierClient(telephone);
      if (!client) {
        if (!prenom && !nom) {
          return res.json({ found: false, client: null });
        }
        client = await fidelite.creerOuRecupererClient({ telephone, prenom, nom, client_id });
      }
      res.json({ found: true, client });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/fidelite/:telephone/solde — solde + historique
router.get('/:telephone/solde',
  param('telephone').matches(/^[+\d]{8,15}$/),
  validate,
  async (req, res, next) => {
    try {
      const data = await fidelite.getSolde(req.params.telephone);
      if (!data) return res.status(404).json({ message: 'Client fidélité introuvable' });
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/fidelite/crediter — créditer des points après une vente
router.post('/crediter',
  body('telephone').matches(/^[+\d]{8,15}$/),
  body('montant_vente').isFloat({ min: 0 }),
  validate,
  async (req, res, next) => {
    try {
      const { telephone, montant_vente, vente_id } = req.body;
      const result = await fidelite.crediterPoints(telephone, vente_id, parseFloat(montant_vente));
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/fidelite/utiliser — utiliser des points en caisse
router.post('/utiliser',
  body('telephone').matches(/^[+\d]{8,15}$/),
  body('points').isInt({ min: 100 }),
  validate,
  async (req, res, next) => {
    try {
      const { telephone, points, vente_id } = req.body;
      const result = await fidelite.utiliserPoints(telephone, parseInt(points, 10), vente_id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
