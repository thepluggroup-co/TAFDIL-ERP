const express = require('express');
const { body, param, query } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const productionService = require('../services/productionService');
const devisService = require('../services/devisService');
const bonLivraisonService = require('../services/bonLivraisonService');
const bonProductionPdfService = require('../services/bonProductionPdfService');
const { validate } = require('../middleware/errorHandler');

const router = express.Router();

// ============================================================
// POST /bon-production
// Technicien déclare la fin de production d'un article
// ============================================================
router.post(
  '/bon-production',
  [
    body('designation').notEmpty().trim(),
    body('type').isIn(['PORTAIL','PORTE','BALCON','GARDE_CORPS','CLAUSTRA','AUTRE']),
    body('date_debut').isISO8601(),
    body('materiaux_utilises').isArray({ min: 0 }),
    body('materiaux_utilises.*.produit_id').matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
    body('materiaux_utilises.*.quantite').isFloat({ gt: 0 }),
    body('cout_main_oeuvre').isFloat({ min: 0 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const technicien_id = req.user.id;
      const {
        designation,
        type,
        dimensions = {},
        materiau,
        finition,
        couleur,
        materiaux_utilises = [],
        cout_main_oeuvre = 0,
        date_debut,
        date_fin = null,
        observations = null,
        photos_urls = [],
        chantier_origine_id = null,
      } = req.body;

      // 1. Calcul coût automatique
      const couts = await productionService.calculerCoutProduction(
        materiaux_utilises,
        parseFloat(cout_main_oeuvre)
      );

      // 2. Numéro de référence
      const { data: refBp } = await supabase.rpc('next_numero_bp');
      const refPf = `PF-${Date.now().toString(36).toUpperCase()}`;

      const produitFiniId = uuidv4();
      const bonId = uuidv4();

      // 3. Créer produit fini (EN_FABRICATION)
      const { error: errPf } = await supabase.from('produits_finis').insert({
        id: produitFiniId,
        reference: refPf,
        designation,
        type,
        dimensions,
        materiau,
        finition,
        couleur,
        cout_production: couts.cout_total,
        prix_vente: couts.prix_vente_suggere,
        statut: 'EN_FABRICATION',
        photos_urls,
        chantier_origine_id,
        bon_production_id: bonId,
      });

      if (errPf) throw new Error(`Création produit fini : ${errPf.message}`);

      // 4. Créer bon de production
      const { error: errBon } = await supabase.from('bons_production').insert({
        id: bonId,
        reference: refBp,
        produit_fini_id: produitFiniId,
        technicien_id,
        date_debut,
        date_fin,
        materiaux_utilises: couts.materiaux_enrichis,
        cout_materiaux: couts.cout_materiaux,
        cout_main_oeuvre: couts.cout_main_oeuvre,
        prix_vente_suggere: couts.prix_vente_suggere,
        statut: 'SOUMIS',
        observations,
      });

      if (errBon) {
        await supabase.from('produits_finis').delete().eq('id', produitFiniId);
        throw new Error(`Création bon : ${errBon.message}`);
      }

      res.status(201).json({
        success: true,
        bon_id: bonId,
        reference: refBp,
        produit_fini_id: produitFiniId,
        cout_detail: {
          cout_materiaux: couts.cout_materiaux,
          cout_main_oeuvre: couts.cout_main_oeuvre,
          cout_total: couts.cout_total,
          prix_vente_suggere: couts.prix_vente_suggere,
        },
        message: 'Bon soumis au DG pour validation.',
      });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// PUT /bon-production/:id/valider
// DG valide → entre en stock boutique
// ============================================================
router.put(
  '/bon-production/:id/valider',
  [
    param('id').isUUID(),
    body('valide_par').isUUID(),
    body('prix_vente_override').optional().isFloat({ gt: 0 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { valide_par, prix_vente_override = null } = req.body;

      const result = await productionService.validerBonProduction(
        req.params.id,
        valide_par,
        prix_vente_override
      );

      res.json({
        success: true,
        ...result,
        message: 'Produit fini validé et entré en stock boutique.',
      });
    } catch (err) {
      // Erreur métier → 409 au lieu de 500
      if (err.message.includes('insuffisant') || err.message.includes('non soumis')) {
        err.status = 409;
      }
      next(err);
    }
  }
);

// ============================================================
// GET /catalogue
// Produits DISPONIBLE (avec filtres)
// ============================================================
router.get('/catalogue', async (req, res, next) => {
  try {
    const { type, materiau, search, page = 1, limit = 24 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let q = supabase
      .from('produits_finis')
      .select('id, reference, designation, type, dimensions, materiau, finition, couleur, prix_vente, photos_urls, created_at', { count: 'exact' })
      .eq('statut', 'DISPONIBLE')
      .order('created_at', { ascending: false });

    if (type) q = q.eq('type', type);
    if (materiau) q = q.ilike('materiau', `%${materiau}%`);
    if (search) q = q.or(`designation.ilike.%${search}%,reference.ilike.%${search}%`);

    q = q.range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await q;
    if (error) throw new Error(error.message);

    res.json({ success: true, total: count, page: parseInt(page), produits: data });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /commande-sur-mesure
// Demande client → crée devis auto
// ============================================================
router.post(
  '/commande-sur-mesure',
  [
    body('type_produit').isIn(['PORTAIL','PORTE','BALCON','GARDE_CORPS','CLAUSTRA','AUTRE']),
    body('client_nom').optional().trim(),
    body('client_telephone').optional().trim(),
    body('specifications').optional().isObject(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const result = await devisService.creerDevis(req.body);
      res.status(201).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// GET /devis/:id
// Détail devis + option PDF
// ============================================================
router.get(
  '/devis/:id',
  [param('id').isUUID()],
  validate,
  async (req, res, next) => {
    try {
      const format = req.query.format; // ?format=pdf

      const { data, error } = await supabase
        .from('devis')
        .select('*, produit:produit_fini_id(designation, type, dimensions, photos_urls)')
        .eq('id', req.params.id)
        .single();

      if (error || !data) return res.status(404).json({ success: false, message: 'Devis introuvable' });

      if (format === 'pdf') {
        const pdfBuf = await genererDevisPDF(data);
        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="devis-${data.numero}.pdf"`,
        });
        return res.send(pdfBuf);
      }

      res.json({ success: true, devis: data });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// PUT /devis/:id/accepter
// Client accepte le devis → crée commande + attend acompte
// ============================================================
router.put(
  '/devis/:id/accepter',
  [param('id').isUUID()],
  validate,
  async (req, res, next) => {
    try {
      const result = await devisService.accepterDevis(req.params.id);
      res.json({ success: true, ...result });
    } catch (err) {
      if (err.message.includes('expiré') || err.message.includes('statut')) {
        err.status = 409;
      }
      next(err);
    }
  }
);

// ============================================================
// POST /commande/:id/acompte
// Enregistrer un paiement d'acompte
// ============================================================
router.post(
  '/commande/:id/acompte',
  [
    param('id').isUUID(),
    body('montant').isFloat({ gt: 0 }),
    body('mode_paiement').isIn(['ESPECES','CARTE','MOBILE_MONEY','VIREMENT','CREDIT']),
    body('encaisse_par').isUUID(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { montant, mode_paiement, encaisse_par, reference_paiement, notes } = req.body;

      const { data: cmd } = await supabase
        .from('commandes_produits_finis')
        .select('id, montant_total, acompte_verse, statut')
        .eq('id', req.params.id)
        .single();

      if (!cmd) return res.status(404).json({ success: false, message: 'Commande introuvable' });
      if (['ANNULE','LIVRE'].includes(cmd.statut)) {
        return res.status(409).json({ success: false, message: `Commande ${cmd.statut}, acompte non accepté` });
      }

      const { error } = await supabase.from('acomptes').insert({
        commande_id: req.params.id,
        montant: parseFloat(montant),
        mode_paiement,
        encaisse_par,
        reference_paiement,
        notes,
      });

      if (error) throw new Error(error.message);

      // Récupérer le cumul mis à jour (trigger l'a calculé)
      const { data: cmdUpd } = await supabase
        .from('commandes_produits_finis')
        .select('acompte_verse, solde_restant, statut')
        .eq('id', req.params.id)
        .single();

      res.status(201).json({
        success: true,
        montant_encaisse: parseFloat(montant),
        acompte_verse_total: cmdUpd.acompte_verse,
        solde_restant: cmdUpd.solde_restant,
        nouveau_statut: cmdUpd.statut,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// POST /commande/:id/bon-livraison
// Créer un bon de livraison pour une commande prête
// ============================================================
router.post(
  '/commande/:id/bon-livraison',
  [
    param('id').isUUID(),
    body('livreur_id').isUUID(),
    body('adresse_livraison').optional().trim(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { livreur_id, adresse_livraison, observations_livreur } = req.body;

      const { data: cmd } = await supabase
        .from('commandes_produits_finis')
        .select('statut, client_nom, bon_livraison_id')
        .eq('id', req.params.id)
        .single();

      if (!cmd) return res.status(404).json({ success: false, message: 'Commande introuvable' });
      if (cmd.bon_livraison_id) {
        return res.status(409).json({ success: false, message: 'Bon de livraison déjà créé pour cette commande' });
      }
      if (!['PRET','EN_FABRICATION'].includes(cmd.statut)) {
        return res.status(409).json({ success: false, message: `Statut commande incompatible : ${cmd.statut}` });
      }

      const { data: numero } = await supabase.rpc('next_numero_bl');
      const blId = uuidv4();

      const { error } = await supabase.from('bons_livraison').insert({
        id: blId,
        numero,
        commande_id: req.params.id,
        livreur_id,
        adresse_livraison,
        observations_livreur,
        date_livraison: new Date().toISOString(),
      });

      if (error) throw new Error(error.message);

      // Lier le BL à la commande
      await supabase
        .from('commandes_produits_finis')
        .update({ bon_livraison_id: blId })
        .eq('id', req.params.id);

      const { data: cfg } = await supabase
        .from('parametres_systeme')
        .select('valeur')
        .eq('cle', 'base_url')
        .single();

      const urlSignature = `${cfg?.valeur || 'https://erp.tafdil.cm'}/signature/${blId}`;

      res.status(201).json({
        success: true,
        bl_id: blId,
        numero,
        url_signature_client: urlSignature,
        message: 'Bon de livraison créé. Partagez l\'URL de signature avec le client.',
      });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// GET /bon-livraison/:id/pdf
// Télécharger le PDF du bon de livraison
// ============================================================
router.get(
  '/bon-livraison/:id/pdf',
  [param('id').isUUID()],
  validate,
  async (req, res, next) => {
    try {
      const pdfBuf = await bonLivraisonService.genererBonLivraisonPDF(req.params.id);

      const { data: bl } = await supabase
        .from('bons_livraison')
        .select('numero')
        .eq('id', req.params.id)
        .single();

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="BL-${bl?.numero || req.params.id}.pdf"`,
        'Content-Length': pdfBuf.length,
      });
      res.send(pdfBuf);
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// POST /bl/signer/:token
// Client signe électroniquement (endpoint public, pas de JWT requis)
// ============================================================
router.post(
  '/bl/signer/:token',
  [
    param('token').isUUID(),
    body('signature_base64').notEmpty().withMessage('Signature base64 requise'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const result = await bonLivraisonService.enregistrerSignature(
        req.params.token,
        req.body.signature_base64
      );
      res.json({ success: true, message: 'Livraison confirmée par signature électronique.', ...result });
    } catch (err) {
      if (err.message.includes('invalide') || err.message.includes('expiré')) err.status = 400;
      next(err);
    }
  }
);

// ============================================================
// GET /stats/production
// Pièces fabriquées, délai moyen, rentabilité
// ============================================================
router.get('/stats/production', async (req, res, next) => {
  try {
    const { debut, fin } = req.query;
    const stats = await productionService.getStatsProduction(debut, fin);
    res.json({ success: true, stats });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /traçabilite/:produit_fini_id
// Tracé complet : produit fini → matières premières consommées
// ============================================================
router.get(
  '/tracabilite/:id',
  [param('id').isUUID()],
  validate,
  async (req, res, next) => {
    try {
      const { data: bp, error } = await supabase
        .from('bons_production')
        .select(`
          reference, date_debut, date_fin, cout_materiaux, cout_main_oeuvre, cout_total,
          materiaux_utilises,
          produit_fini:produit_fini_id(reference, designation, type, prix_vente, statut),
          technicien_id,
          valide_par
        `)
        .eq('produit_fini_id', req.params.id)
        .single();

      if (error || !bp) return res.status(404).json({ success: false, message: 'Traçabilité introuvable' });

      const marge = bp.produit_fini?.prix_vente && bp.cout_total
        ? Math.round(((bp.produit_fini.prix_vente - bp.cout_total) / bp.cout_total) * 100 * 10) / 10
        : null;

      res.json({
        success: true,
        tracabilite: {
          bon_production: bp.reference,
          periode: { debut: bp.date_debut, fin: bp.date_fin },
          produit_fini: bp.produit_fini,
          technicien: bp.technicien_id || 'N/A',
          valide_par: bp.valide_par || 'N/A',
          couts: {
            materiaux: bp.cout_materiaux,
            main_oeuvre: bp.cout_main_oeuvre,
            total: bp.cout_total,
            prix_vente: bp.produit_fini?.prix_vente,
            marge_pct: marge,
          },
          materiaux_consommes: bp.materiaux_utilises,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// GET /bon-production/:id/pdf
// PDF du bon de production avec charte TAFDIL
// ============================================================
router.get(
  '/bon-production/:id/pdf',
  [param('id').isUUID()],
  validate,
  async (req, res, next) => {
    try {
      const pdfBuf = await bonProductionPdfService.genererBonProductionPDF(req.params.id);

      const { data: bon } = await supabase
        .from('bons_production')
        .select('reference')
        .eq('id', req.params.id)
        .single();

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="BP-${bon?.reference || req.params.id}.pdf"`,
        'Content-Length': pdfBuf.length,
      });
      res.send(pdfBuf);
    } catch (err) {
      next(err);
    }
  }
);

// ────────────────────────────────────────────────────────────
// Utilitaire interne : PDF devis (appelé par GET /devis/:id?format=pdf)
// ────────────────────────────────────────────────────────────
async function genererDevisPDF(devis) {
  const PDFDocument = require('pdfkit');
  const supabaseLocal = require('../config/supabase');
  const { TAFDIL } = require('../services/pdfBranding');

  const { data: params } = await supabaseLocal
    .from('parametres_systeme')
    .select('cle, valeur');
  const cfg = Object.fromEntries(params.map(p => [p.cle, p.valeur]));

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = 495.28;
    const PRIMARY = TAFDIL.rouge;
    const ACCENT  = TAFDIL.rouge;

    // En-tête
    doc.rect(0, 0, 595.28, 85).fill(PRIMARY);
    doc.fillColor('white').font('Helvetica-Bold').fontSize(20)
      .text(cfg.raison_sociale || TAFDIL.raison_sociale, 50, 14, { width: W * 0.6 });
    doc.font('Helvetica').fontSize(8)
      .text(TAFDIL.activite, 50, 40)
      .text(`${cfg.ville || 'Douala'} | ${cfg.telephone || TAFDIL.tel1}`, 50, 52)
      .text(TAFDIL.email, 50, 64);
    doc.fillColor('white').font('Helvetica-Bold').fontSize(22)
      .text('DEVIS', 50 + W * 0.58, 14, { width: W * 0.42, align: 'right' });
    doc.font('Helvetica').fontSize(10)
      .text(devis.numero, 50 + W * 0.58, 46, { width: W * 0.42, align: 'right' });

    let y = 100;

    // Infos client + devis
    doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(9)
      .text('CLIENT', 50, y).text('VALIDITÉ', 320, y);
    doc.fillColor('#333').font('Helvetica').fontSize(10)
      .text(devis.client_nom || devis.client_email || '—', 50, y + 14)
      .text(devis.client_telephone || '', 50, y + 26)
      .text(devis.date_validite ? `Valable jusqu\'au ${devis.date_validite}` : '', 320, y + 14);
    y += 50;

    // Séparateur
    doc.moveTo(50, y).lineTo(545, y).strokeColor(ACCENT).lineWidth(2).stroke().lineWidth(1);
    y += 14;

    // Objet
    doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(11)
      .text('OBJET DU DEVIS', 50, y);
    y += 18;

    const specs = devis.specifications || {};
    const lines = [
      ['Type de produit', devis.type_produit],
      ['Dimensions', specs.largeur ? `${specs.largeur}×${specs.hauteur} mm` : null],
      ['Matériau', specs.materiau],
      ['Finition', specs.finition],
      ['Couleur', specs.couleur],
      ['Délai fabrication', `${devis.delai_fabrication_jours || 14} jours ouvrables`],
      ['Notes', specs.notes],
    ].filter(([, v]) => v);

    for (const [lbl, val] of lines) {
      doc.fillColor('#555').font('Helvetica-Bold').fontSize(9).text(`${lbl} :`, 50, y, { continued: true, width: 140 });
      doc.font('Helvetica').fillColor('#333').fontSize(9).text(` ${val}`, { continued: false });
      y += 16;
    }
    y += 10;

    // Tableau financier
    doc.rect(50, y, W, 28).fill(TAFDIL.gris_clair);
    doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(9)
      .text('DÉSIGNATION', 60, y + 9, { width: W * 0.5 })
      .text('MONTANT', 60, y + 9, { width: W - 20, align: 'right' });
    y += 28;

    const rowFin = (label, val, bold = false) => {
      doc.rect(50, y, W, 22).strokeColor('#ddd').stroke();
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 9)
        .fillColor(bold ? PRIMARY : '#333')
        .text(label, 60, y + 6, { width: W * 0.6 });
      doc.fillColor(bold ? ACCENT : '#333')
        .text(new Intl.NumberFormat('fr-CM').format(val || 0) + ' XAF', 60, y + 6, { width: W - 20, align: 'right' });
      y += 22;
    };

    rowFin('Montant HT', devis.montant_ht);
    rowFin(`TVA ${cfg.tva_taux || 19.25}%`, devis.montant_tva);
    rowFin('TOTAL TTC', devis.montant_total, true);
    y += 6;
    rowFin(`Acompte à la commande (${devis.acompte_pct}%)`, devis.montant_acompte);

    // Conditions
    y += 20;
    doc.fillColor('#888').font('Helvetica').fontSize(7.5)
      .text('Ce devis est valable 30 jours. La commande est confirmée à réception de l\'acompte indiqué. ' +
        'Les dimensions définitives sont à valider avant mise en fabrication.', 50, y, { width: W });

    // Pied de page
    doc.rect(0, 791, 595.28, 50).fill(TAFDIL.noir);
    doc.fillColor('white').font('Helvetica').fontSize(7)
      .text(
        `${TAFDIL.raison_sociale} | ${TAFDIL.adresse} | ${TAFDIL.tel1} | ${TAFDIL.email} — Devis généré le ${new Date().toLocaleDateString('fr-CM')}`,
        50, 807, { width: W, align: 'center' }
      );

    doc.end();
  });
}

module.exports = router;
