const express = require('express');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/errorHandler');
const { requireRole } = require('../middleware/auth');
const paie = require('../services/paieService');
const { genererBulletinPDF } = require('../services/bulletinPdfService');

const router = express.Router();

// POST /api/paie/calculer-bulletin — calcul unitaire (prévisualisation)
router.post('/calculer-bulletin',
  body('employe_id').isUUID(),
  body('annee').isInt({ min: 2020 }),
  body('mois').isInt({ min: 1, max: 12 }),
  validate,
  async (req, res, next) => {
    try {
      const calcul = await paie.calculerBulletin(req.body);
      // Sauvegarder en BROUILLON automatiquement
      const bulletin = await paie.sauvegarderBulletin(calcul);
      res.json({ calcul, bulletin_id: bulletin.id });
    } catch (err) { next(err); }
  }
);

// GET /api/paie/bulletins/:employe_id — historique bulletins d'un employé
router.get('/bulletins/:employe_id',
  param('employe_id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const supabase = require('../config/supabase');
      const { data, error } = await supabase
        .from('bulletins_paie')
        .select('id, annee, mois, statut, salaire_brut, salaire_net, cout_total_employeur, pdf_url')
        .eq('employe_id', req.params.employe_id)
        .order('annee', { ascending: false })
        .order('mois', { ascending: false })
        .limit(36);
      if (error) throw new Error(error.message);
      res.json(data);
    } catch (err) { next(err); }
  }
);

// GET /api/paie/bulletin/:id/pdf — PDF d'un bulletin
router.get('/bulletin/:id/pdf',
  param('id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const pdf = await genererBulletinPDF(req.params.id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="bulletin-${req.params.id}.pdf"`);
      res.send(pdf);
    } catch (err) { next(err); }
  }
);

// POST /api/paie/journal/generer — génération mensuelle globale
router.post('/journal/generer',
  requireRole('DG', 'ADMIN'),
  body('annee').isInt({ min: 2020 }),
  body('mois').isInt({ min: 1, max: 12 }),
  validate,
  async (req, res, next) => {
    try {
      const result = await paie.genererJournalPaie(
        parseInt(req.body.annee),
        parseInt(req.body.mois)
      );
      res.json(result);
    } catch (err) { next(err); }
  }
);

// PUT /api/paie/journal/:id/valider — DG valide le journal
router.put('/journal/:id/valider',
  requireRole('DG'),
  param('id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const data = await paie.validerJournal(req.params.id, req.user.id);
      res.json(data);
    } catch (err) { next(err); }
  }
);

// GET /api/paie/journaux — liste des journaux
router.get('/journaux', async (req, res, next) => {
  try {
    const supabase = require('../config/supabase');
    const { data, error } = await supabase
      .from('journaux_paie')
      .select('*')
      .order('annee', { ascending: false })
      .order('mois', { ascending: false })
      .limit(24);
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) { next(err); }
});

// GET /api/paie/journal/:id/pdf-export — export PDF tous les bulletins du journal
router.get('/journal/:id/pdf-export',
  requireRole('DG', 'ADMIN'),
  param('id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const supabase = require('../config/supabase');
      const { data: journal } = await supabase
        .from('journaux_paie')
        .select('*')
        .eq('id', req.params.id)
        .single();

      if (!journal) return res.status(404).json({ message: 'Journal introuvable' });

      // Génère chaque bulletin et concatène les PDFs via stream
      // Pour simplifier : retourne le premier bulletin en attendant implémentation full merge
      const bulletins_ids = journal.bulletins_ids || [];
      if (bulletins_ids.length === 0) {
        return res.status(204).end();
      }

      // Export du premier bulletin pour le DG (à itérer côté client)
      const pdfs = [];
      for (const bid of bulletins_ids.slice(0, 50)) {
        try {
          const pdf = await genererBulletinPDF(bid);
          pdfs.push(pdf);
        } catch {}
      }

      // Retourne les PDFs en JSON avec base64 pour download multi-fichiers
      const mois_noms = ['','Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
      res.json({
        journal_id: req.params.id,
        periode: `${mois_noms[journal.mois]}-${journal.annee}`,
        bulletins: pdfs.map((pdf, i) => ({
          bulletin_id: bulletins_ids[i],
          pdf_base64: pdf.toString('base64'),
        })),
      });
    } catch (err) { next(err); }
  }
);

// GET /api/paie/declaration-cnps — données déclaration CNPS (JSON → Excel côté client)
router.get('/declaration-cnps',
  query('annee').isInt({ min: 2020 }),
  query('mois').isInt({ min: 1, max: 12 }),
  validate,
  async (req, res, next) => {
    try {
      const data = await paie.getDeclarationCNPS(
        parseInt(req.query.annee),
        parseInt(req.query.mois)
      );
      res.json(data);
    } catch (err) { next(err); }
  }
);

// GET /api/paie/cout-masse-salariale — tableau de bord coûts RH
router.get('/cout-masse-salariale', async (req, res, next) => {
  try {
    const data = await paie.getMasseSalariale();
    res.json(data);
  } catch (err) { next(err); }
});

// GET /api/paie/parametres — paramètres de paie
router.get('/parametres', async (req, res, next) => {
  try {
    const supabase = require('../config/supabase');
    const { data, error } = await supabase
      .from('parametres_paie')
      .select('*')
      .order('annee', { ascending: false });
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) { next(err); }
});

// PUT /api/paie/parametres/:annee — mise à jour paramètres (DG)
router.put('/parametres/:annee',
  requireRole('DG'),
  param('annee').isInt({ min: 2020 }),
  validate,
  async (req, res, next) => {
    try {
      const supabase = require('../config/supabase');
      const { data, error } = await supabase
        .from('parametres_paie')
        .upsert({ annee: parseInt(req.params.annee), ...req.body, actif: true }, { onConflict: 'annee,actif' })
        .select()
        .single();
      if (error) throw new Error(error.message);
      res.json(data);
    } catch (err) { next(err); }
  }
);

// POST /api/paie/avances — enregistrer une avance sur salaire
router.post('/avances',
  requireRole('DG', 'ADMIN'),
  body('employe_id').isUUID(),
  body('annee').isInt({ min: 2020 }),
  body('mois').isInt({ min: 1, max: 12 }),
  body('montant_xaf').isFloat({ min: 1000 }),
  validate,
  async (req, res, next) => {
    try {
      const supabase = require('../config/supabase');
      const { data, error } = await supabase
        .from('avances_salaire')
        .insert({ ...req.body, cree_par: req.user.id })
        .select()
        .single();
      if (error) throw new Error(error.message);
      res.status(201).json(data);
    } catch (err) { next(err); }
  }
);

module.exports = router;
