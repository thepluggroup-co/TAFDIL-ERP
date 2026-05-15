const express = require('express');
const { body, param, query } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const stockService = require('../services/stockService');
const pricingService = require('../services/pricingService');
const ticketService = require('../services/ticketService');
const { validate } = require('../middleware/errorHandler');

const router = express.Router();

// ============================================================
// POST /vente-comptoir
// Crée une vente caisse (client public ou interne)
// ============================================================
router.post(
  '/vente-comptoir',
  [
    body('client_type').isIn(['PUBLIC', 'INTERNE']).withMessage('client_type doit être PUBLIC ou INTERNE'),
    body('mode_paiement').isIn(['ESPECES', 'CARTE', 'MOBILE_MONEY', 'VIREMENT', 'CREDIT']),
    body('lignes').isArray({ min: 1 }).withMessage('Au moins une ligne requise'),
    body('lignes.*.produit_id').isUUID(),
    body('lignes.*.quantite').isFloat({ gt: 0 }),
    body('lignes.*.remise_pct').optional().isFloat({ min: 0, max: 100 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const {
        client_type,
        client_id = null,
        client_nom = null,
        mode_paiement,
        lignes,
        notes = null,
        remise_dg_pct = 0,
      } = req.body;

      // vendeur_id déduit de l'utilisateur authentifié (plus sûr que de le recevoir du body)
      const vendeur_id = req.user.id;

      // 1. Vérification disponibilité stock
      const dispo = await stockService.verifierDisponibilite(lignes);
      if (!dispo.ok) {
        return res.status(409).json({
          success: false,
          message: 'Conflit de stock détecté',
          conflits: dispo.conflits,
        });
      }

      // 2. Résolution des prix selon type client
      const lignesAvecPrix = await Promise.all(
        lignes.map(async (ligne) => {
          const tarif = await pricingService.calculerPrix(
            ligne.produit_id,
            client_type,
            ligne.remise_pct ?? remise_dg_pct
          );
          return {
            ...ligne,
            prix_unitaire_applique: tarif.prix_final,
            remise_pct: ligne.remise_pct ?? remise_dg_pct,
          };
        })
      );

      // 3. Calcul totaux
      const totaux = await pricingService.calculerTotaux(lignesAvecPrix);

      // 4. Numéro de vente
      const { data: numData } = await supabase.rpc('next_numero_vente');
      const numero = numData;

      // 5. Insertion vente + lignes (transaction manuelle Supabase)
      const venteId = uuidv4();

      const { error: errVente } = await supabase.from('ventes_comptoir').insert({
        id: venteId,
        numero,
        vendeur_id,
        client_type,
        client_id,
        client_nom,
        mode_paiement,
        montant_ht: totaux.montant_ht,
        montant_remise: totaux.montant_remise,
        montant_tva: totaux.montant_tva,
        montant_total: totaux.montant_total,
        statut_paiement: mode_paiement === 'CREDIT' ? 'EN_ATTENTE' : 'PAYE',
        notes,
      });

      if (errVente) throw new Error(`Création vente : ${errVente.message}`);

      const { error: errLignes } = await supabase.from('ventes_comptoir_lignes').insert(
        lignesAvecPrix.map((l) => ({
          vente_id: venteId,
          produit_id: l.produit_id,
          quantite: l.quantite,
          prix_unitaire_applique: l.prix_unitaire_applique,
          remise_pct: l.remise_pct,
        }))
      );

      if (errLignes) {
        // Rollback manuel
        await supabase.from('ventes_comptoir').delete().eq('id', venteId);
        throw new Error(`Insertion lignes : ${errLignes.message}`);
      }

      // 6. Décrémentation du stock via verrou consultatif (advisory lock)
      // Empêche les conflits simultanés ERP ↔ e-commerce sur le même article
      for (const ligne of lignesAvecPrix) {
        const { data: lockResult, error: lockErr } = await supabase.rpc(
          'fn_decrement_stock_secure',
          {
            p_produit_id: ligne.produit_id,
            p_quantite:   ligne.quantite,
            p_source:     'ERP',
          }
        );
        if (lockErr) throw new Error(`Erreur verrouillage stock : ${lockErr.message}`);
        const row = lockResult?.[0];
        if (row && !row.ok) {
          // Rollback vente si stock insuffisant après verrou
          await supabase.from('ventes_comptoir_lignes').delete().eq('vente_id', venteId);
          await supabase.from('ventes_comptoir').delete().eq('id', venteId);
          return res.status(409).json({ success: false, message: row.message });
        }
      }

      // Enregistrer mouvements de sortie
      await supabase.from('mouvements_stock').insert(
        lignesAvecPrix.map(l => ({
          produit_id:     l.produit_id,
          type_mouvement: 'SORTIE',
          quantite:       l.quantite,
          source_canal:   'ERP',
          reference_doc:  numero,
          user_id:        vendeur_id,
        }))
      );

      res.status(201).json({
        success: true,
        vente_id: venteId,
        numero,
        totaux,
        message: 'Vente enregistrée avec succès',
      });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// GET /catalogue-public
// Produits disponibles au public (avec filtres catégorie TAFDIL)
// ============================================================
router.get('/catalogue-public', async (req, res, next) => {
  try {
    const { categorie, categorie_detail, stock_min, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let q = supabase
      .from('v_stock_dispo_boutique')
      .select('*', { count: 'exact' })
      .eq('disponible_boutique', true)
      .gt('stock_dispo_boutique', 0)
      .order('designation');

    if (categorie)        q = q.eq('categorie', categorie);
    if (categorie_detail) q = q.eq('categorie_detail', categorie_detail);
    if (stock_min)        q = q.gte('stock_dispo_boutique', parseFloat(stock_min));
    if (search)           q = q.ilike('designation', `%${search}%`);

    q = q.range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await q;
    if (error) throw new Error(error.message);

    res.json({
      success: true,
      total: count,
      page: parseInt(page),
      produits: data,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /mouvements/:id
// Historique entrées/sorties d'un produit
// ============================================================
router.get(
  '/mouvements/:id',
  [param('id').isUUID()],
  validate,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { limit = 50, type_mouvement } = req.query;

      let q = supabase
        .from('mouvements_stock')
        .select('*')
        .eq('produit_id', id)
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));

      if (type_mouvement) q = q.eq('type_mouvement', type_mouvement);

      const { data, error } = await q;
      if (error) throw new Error(error.message);

      const entrees = data.filter(m => m.type_mouvement === 'ENTREE').reduce((s, m) => s + +m.quantite, 0);
      const sorties = data.filter(m => m.type_mouvement === 'SORTIE').reduce((s, m) => s + +m.quantite, 0);

      res.json({ success: true, mouvements: data, totaux: { entrees, sorties } });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// GET /stock-dispo/:id
// Stock réel - réservé atelier pour un produit
// ============================================================
router.get(
  '/stock-dispo/:id',
  [param('id').isUUID()],
  validate,
  async (req, res, next) => {
    try {
      const stock = await stockService.getStockDispo(req.params.id);
      res.json({ success: true, stock });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// POST /caisse/ticket
// Génération ticket de caisse PDF 58mm
// ============================================================
router.post(
  '/caisse/ticket',
  [body('vente_id').isUUID()],
  validate,
  async (req, res, next) => {
    try {
      const { vente_id } = req.body;

      // Récupération vente + lignes + désignations produits
      // Note: pas de join auth.users (schéma différent) — on récupère le vendeur séparément
      const { data: vente, error: errVente } = await supabase
        .from('ventes_comptoir')
        .select(`
          *,
          lignes:ventes_comptoir_lignes (
            *,
            produit:produits ( designation )
          )
        `)
        .eq('id', vente_id)
        .single();

      if (errVente || !vente) {
        return res.status(404).json({ success: false, message: 'Vente introuvable' });
      }

      // Normalisation lignes
      const lignesNormalisees = vente.lignes.map((l) => ({
        ...l,
        designation: l.produit?.designation || 'Produit',
      }));

      // Récupération nom vendeur via admin API (auth.users inaccessible via PostgREST public)
      let vendeurNom = 'Caissier';
      try {
        const { data: authData } = await supabase.auth.admin.getUserById(vente.vendeur_id);
        const meta = authData?.user?.user_metadata;
        vendeurNom = meta?.full_name || meta?.name || authData?.user?.email || 'Caissier';
      } catch {}

      const pdfBuffer = await ticketService.genererTicketPDF({
        ...vente,
        lignes: lignesNormalisees,
        vendeur_nom: vendeurNom,
      });

      // Marquer comme imprimé
      await supabase
        .from('ventes_comptoir')
        .update({ ticket_imprime: true })
        .eq('id', vente_id);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="ticket-${vente.numero}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });
      res.send(pdfBuffer);
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// GET /stats/jour
// Ventes du jour : public vs interne, CA, nb transactions
// ============================================================
router.get('/stats/jour', async (req, res, next) => {
  try {
    const dateParam = req.query.date || new Date().toISOString().slice(0, 10);
    const debut = `${dateParam}T00:00:00+00:00`;
    const fin = `${dateParam}T23:59:59+00:00`;

    const { data, error } = await supabase
      .from('ventes_comptoir')
      .select('client_type, montant_total, statut_paiement')
      .gte('date_vente', debut)
      .lte('date_vente', fin)
      .neq('statut_paiement', 'ANNULE');

    if (error) throw new Error(error.message);

    const stats = {
      date: dateParam,
      nb_transactions: data.length,
      ca_total: 0,
      public: { nb: 0, ca: 0 },
      interne: { nb: 0, ca: 0 },
      par_statut: {},
    };

    for (const v of data) {
      stats.ca_total += v.montant_total;

      if (v.client_type === 'PUBLIC') {
        stats.public.nb++;
        stats.public.ca += v.montant_total;
      } else {
        stats.interne.nb++;
        stats.interne.ca += v.montant_total;
      }

      stats.par_statut[v.statut_paiement] = (stats.par_statut[v.statut_paiement] || 0) + 1;
    }

    res.json({ success: true, stats });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /stock-conflits
// Produits avec réservation atelier disputée avec boutique
// ============================================================
router.get('/stock-conflits', async (req, res, next) => {
  try {
    const conflits = await stockService.getStockConflits();
    res.json({ success: true, total: conflits.length, conflits });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /sync-offline
// Synchronisation des ventes créées hors ligne
// Format: { ventes: [{ ...vente, lignes: [...] }] }
// ============================================================
router.post(
  '/sync-offline',
  [body('ventes').isArray({ min: 1 })],
  validate,
  async (req, res, next) => {
    try {
      const { ventes } = req.body;
      const resultats = [];

      for (const vente of ventes) {
        try {
          // Vérifie si déjà synchronisée (idempotence par id ou numero)
          const { data: existante } = await supabase
            .from('ventes_comptoir')
            .select('id, numero')
            .or(`id.eq.${vente.id},numero.eq.${vente.numero}`)
            .maybeSingle();

          if (existante) {
            resultats.push({ id: vente.id, statut: 'DEJA_SYNCHRO', numero: existante.numero });
            continue;
          }

          // Validation minimale stock (sans blocage — mode offline permissif)
          const dispo = await stockService.verifierDisponibilite(vente.lignes);

          const { data: numData } = await supabase.rpc('next_numero_vente');
          const numero = numData;
          const venteId = vente.id || uuidv4();
          const totaux = await pricingService.calculerTotaux(vente.lignes);

          await supabase.from('ventes_comptoir').insert({
            id: venteId,
            numero,
            vendeur_id: vente.vendeur_id,
            client_type: vente.client_type || 'PUBLIC',
            client_nom: vente.client_nom,
            mode_paiement: vente.mode_paiement || 'ESPECES',
            montant_ht: totaux.montant_ht,
            montant_remise: totaux.montant_remise,
            montant_tva: totaux.montant_tva,
            montant_total: totaux.montant_total,
            statut_paiement: 'PAYE',
            notes: vente.notes,
            sync_offline: true,
            date_vente: vente.date_vente || new Date().toISOString(),
          });

          await supabase.from('ventes_comptoir_lignes').insert(
            vente.lignes.map((l) => ({
              vente_id: venteId,
              produit_id: l.produit_id,
              quantite: l.quantite,
              prix_unitaire_applique: l.prix_unitaire_applique,
              remise_pct: l.remise_pct || 0,
            }))
          );

          await stockService.decrementerStock(vente.lignes);

          resultats.push({
            id: venteId,
            statut: 'SYNCHRO_OK',
            numero,
            avertissements: dispo.ok ? [] : dispo.conflits.map(c => c.designation),
          });
        } catch (ventErr) {
          resultats.push({ id: vente.id, statut: 'ERREUR', message: ventErr.message });
        }
      }

      const ok = resultats.filter(r => r.statut === 'SYNCHRO_OK').length;
      const erreurs = resultats.filter(r => r.statut === 'ERREUR').length;

      res.json({
        success: true,
        resume: { total: ventes.length, synchronisees: ok, erreurs, doublons: ventes.length - ok - erreurs },
        resultats,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
