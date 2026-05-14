const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const inv = require('../services/inventaireService');

// Emplacements
router.get('/emplacements', requireAuth, async (req, res) => {
  try { res.json(await inv.getEmplacements()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Stock consolidé
router.get('/stock-consolide', requireAuth, async (req, res) => {
  try { res.json(await inv.getStockConsolide(req.query)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Sessions inventaire
router.get('/sessions', requireAuth, async (req, res) => {
  try { res.json(await inv.listerSessions(req.query)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/sessions', requireAuth, requireRole('DG','MAGASINIER','CHEF_ATELIER'), async (req, res) => {
  try {
    let { emplacement_id, emplacement_code } = req.body;
    // Support emplacement_code → resolve to emplacement_id
    if (!emplacement_id && emplacement_code) {
      const supabase = require('../config/supabase');
      const { data: emp } = await supabase
        .from('emplacements')
        .select('id')
        .eq('code', emplacement_code)
        .single();
      if (!emp) return res.status(400).json({ error: `Emplacement "${emplacement_code}" introuvable` });
      emplacement_id = emp.id;
    }
    if (!emplacement_id) return res.status(400).json({ error: 'emplacement_id requis' });
    res.status(201).json(await inv.creerSession({ emplacement_id, responsable_id: req.user.id }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Enregistrer un écart pour un produit dans une session (cherche la ligne automatiquement)
router.post('/sessions/:id/ecart', requireAuth, async (req, res) => {
  try {
    const supabase = require('../config/supabase');
    const { produit_id, quantite_comptee } = req.body;
    const { data: ligne } = await supabase
      .from('lignes_inventaire')
      .select('id')
      .eq('session_id', req.params.id)
      .eq('produit_id', produit_id)
      .single();
    if (!ligne) return res.status(404).json({ error: 'Ligne inventaire non trouvée pour ce produit' });
    res.json(await inv.saisirLigne({
      session_id: req.params.id,
      ligne_id: ligne.id,
      stock_compte: quantite_comptee,
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/sessions/:id/lignes', requireAuth, async (req, res) => {
  try { res.json(await inv.getLignesSession(req.params.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/sessions/:id/lignes/:ligne_id', requireAuth, async (req, res) => {
  try {
    res.json(await inv.saisirLigne({ session_id: req.params.id, ligne_id: req.params.ligne_id, ...req.body }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/sessions/:id/valider', requireAuth, requireRole('DG'), async (req, res) => {
  try { res.json(await inv.validerInventaire(req.params.id, req.user.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Transferts inter-sites
router.get('/transferts', requireAuth, async (req, res) => {
  try { res.json(await inv.listerTransferts(req.query)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/transferts', requireAuth, async (req, res) => {
  try {
    res.status(201).json(await inv.creerTransfert({ ...req.body, demandeur_id: req.user.id }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/transferts/:id/valider', requireAuth, requireRole('DG','CHEF_ATELIER','MAGASINIER'), async (req, res) => {
  try { res.json(await inv.validerTransfert(req.params.id, req.user.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/transferts/:id/annuler', requireAuth, async (req, res) => {
  try { res.json(await inv.annulerTransfert(req.params.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
