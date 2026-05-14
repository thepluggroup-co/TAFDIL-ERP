const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Toutes les routes métier requièrent une authentification Supabase
router.use(requireAuth);

// Modules A — Boutiques
router.use('/boutique-quincaillerie',  require('./boutique-quincaillerie'));
router.use('/boutique-produits-finis', require('./boutique-produits-finis'));

// Modules C — CRM / Devis / Fidélité / Traçabilité / Approvisionnement / Notifications
router.use('/devis',               require('./devis-engine'));
router.use('/fidelite',            require('./fidelite'));
router.use('/tracabilite',         require('./tracabilite'));
router.use('/approvisionnement',   require('./approvisionnement'));
router.use('/notifications',       require('./notifications'));

// Modules D — Production / Qualité / Maintenance
router.use('/mrp',         require('./mrp'));
router.use('/qualite',     require('./qualite'));
router.use('/maintenance', require('./maintenance'));

// Module E — Ressources Humaines & Paie
router.use('/rh',   require('./rh'));
router.use('/paie', require('./paie'));

// OPT-3 — CRM Enrichi
router.use('/crm', require('./crm'));

// OPT-4 — Comptabilité SYSCOHADA
router.use('/compta', require('./compta'));

// OPT-5 — Multi-Entrepôts & Inventaire
router.use('/inventaire', require('./inventaire'));

// OPT-6 — Audit Log (DG seulement)
router.use('/audit', require('./audit'));

// OPT-7 — KPIs & Alertes Prédictives
router.use('/kpis', require('./kpis'));

module.exports = router;
