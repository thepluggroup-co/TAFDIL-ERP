const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const crm = require('../services/crmService');

// Pipeline Kanban
router.get('/pipeline', requireAuth, async (req, res) => {
  try { res.json(await crm.getPipeline()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/clients/:id/pipeline', requireAuth, requireRole('DG','SECRETAIRE'), async (req, res) => {
  try {
    const { statut, charge_commercial_id } = req.body;
    res.json(await crm.mettreAJourPipeline(req.params.id, statut, charge_commercial_id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Historique 360°
router.get('/clients/:id/historique', requireAuth, async (req, res) => {
  try { res.json(await crm.getHistorique360(req.params.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Encours & retards
router.get('/clients/:id/encours', requireAuth, async (req, res) => {
  try { res.json(await crm.getEncours(req.params.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Notes CRM
router.post('/clients/:id/note', requireAuth, async (req, res) => {
  try {
    const { type, contenu, date_prochaine_action } = req.body;
    res.status(201).json(await crm.ajouterNote({
      client_id: req.params.id,
      auteur_id: req.user.id,
      type, contenu, date_prochaine_action,
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Clients à risque élevé
router.get('/clients/risque-eleve', requireAuth, requireRole('DG','SECRETAIRE'), async (req, res) => {
  try { res.json(await crm.getClientsRisqueEleve()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// WhatsApp
router.post('/whatsapp/envoyer', requireAuth, async (req, res) => {
  try {
    const msg = await crm.envoyerWhatsApp({ ...req.body, envoye_par: req.user.id });
    res.status(201).json(msg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Relances automatiques impayés (tâche planifiée ou déclenchement manuel DG)
router.post('/relances/auto', requireAuth, requireRole('DG'), async (req, res) => {
  try {
    const relances = await crm.traiterRelancesImpayees();
    res.json({ envoyes: relances.length, relances });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
