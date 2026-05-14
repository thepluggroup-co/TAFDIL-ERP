'use strict';

/**
 * Routes /api/ext/ — Interface cross-système ERP ↔ E-commerce
 * Authentification : API key (header X-Api-Key) ≠ JWT ERP
 * Consommateurs : backend e-commerce (Render/Railway), webhooks Lovable
 */

const express = require('express');
const supabase = require('../config/supabase');

const router = express.Router();

// ── Middleware API key ────────────────────────────────────────────────────────

function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (!key || key !== process.env.ERP_API_KEY) {
    return res.status(401).json({ success: false, message: 'Clé API invalide ou manquante' });
  }
  req.source = req.headers['x-source'] || 'unknown'; // erp-native | ecommerce | mobile
  next();
}

router.use(requireApiKey);

// ── GET /api/ext/catalogue — Catalogue produits finis pour e-commerce ─────────
router.get('/catalogue', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('produits_finis')
      .select(`
        id, reference, designation, type, dimensions,
        materiau, finition, couleur,
        prix_vente, statut, photos_urls,
        ecommerce_synced_at
      `)
      .eq('statut', 'DISPONIBLE')
      .eq('disponible_ecommerce', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data, total: data.length });
  } catch (err) { next(err); }
});

// ── GET /api/ext/stock/:id — Stock disponible d'un produit ───────────────────
router.get('/stock/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('produits')
      .select('id, designation, stock_actuel, stock_reserve_atelier, stock_min')
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ success: false, message: 'Produit introuvable' });

    const disponible = Math.max(0, data.stock_actuel - (data.stock_reserve_atelier || 0));
    res.json({
      success: true,
      produit_id: data.id,
      designation: data.designation,
      stock_actuel: data.stock_actuel,
      stock_disponible: disponible,
      alerte_rupture: disponible <= data.stock_min,
    });
  } catch (err) { next(err); }
});

// ── POST /api/ext/commande-enligne — Réception commande depuis e-commerce ─────
router.post('/commande-enligne', async (req, res, next) => {
  try {
    const {
      client_nom, client_telephone, client_email,
      produit_fini_id, montant_total, acompte_verse,
      notes, commande_ecommerce_id,
    } = req.body;

    if (!client_nom || !produit_fini_id || !montant_total) {
      return res.status(400).json({ success: false, message: 'Champs requis manquants' });
    }

    // Crée ou retrouve le client
    let { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('telephone', client_telephone)
      .maybeSingle();

    if (!client) {
      const { data: newClient, error: ce } = await supabase
        .from('clients')
        .insert({ nom: client_nom, telephone: client_telephone, email: client_email,
                  source_acquisition: 'ECOMMERCE' })
        .select('id')
        .single();
      if (ce) throw ce;
      client = newClient;
    }

    // Crée la commande dans l'ERP
    const { data: commande, error: cmdErr } = await supabase
      .from('commandes_produits_finis')
      .insert({
        client_id: client.id,
        produit_fini_id,
        montant_total,
        acompte_verse: acompte_verse || 0,
        statut: 'CONFIRMÉE',
        source: 'ECOMMERCE',
        reference_externe: commande_ecommerce_id,
        notes,
      })
      .select('id, reference')
      .single();

    if (cmdErr) throw cmdErr;

    // Émet Realtime → notifie le DG ERP
    await supabase.channel('commandes-live').send({
      type: 'broadcast',
      event: 'nouvelle_commande_enligne',
      payload: {
        commande_id: commande.id,
        client: client_nom,
        montant: montant_total,
        type: 'ECOMMERCE',
        reference_externe: commande_ecommerce_id,
      },
    });

    res.status(201).json({
      success: true,
      commande_id: commande.id,
      reference: commande.reference,
      numero_suivi: commande.reference,
    });
  } catch (err) { next(err); }
});

// ── POST /api/ext/devis-demande — Demande de devis sur mesure ────────────────
router.post('/devis-demande', async (req, res, next) => {
  try {
    const { client_nom, client_telephone, client_email, type_produit,
            dimensions, materiau, finition, localisation_chantier,
            date_souhaitee, notes } = req.body;

    if (!client_nom || !type_produit) {
      return res.status(400).json({ success: false, message: 'client_nom et type_produit requis' });
    }

    const { data: devis, error } = await supabase
      .from('devis')
      .insert({
        client_nom, client_telephone, client_email,
        type_produit, dimensions, materiau, finition,
        localisation_chantier, date_souhaitee, notes,
        source: 'ECOMMERCE',
        statut: 'BROUILLON',
      })
      .select('id, reference')
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      devis_id: devis.id,
      reference: devis.reference,
      message: 'Demande de devis enregistrée. Notre équipe vous contactera sous 24h.',
    });
  } catch (err) { next(err); }
});

// ── GET /api/ext/commande/:id — Statut commande pour tracking client ──────────
router.get('/commande/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('commandes_produits_finis')
      .select(`
        id, reference, statut, montant_total, acompte_verse,
        created_at, updated_at,
        produits_finis ( designation, type, statut )
      `)
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ success: false, message: 'Commande introuvable' });

    res.json({
      success: true,
      commande: {
        id: data.id,
        reference: data.reference,
        statut: data.statut,
        montant_total: data.montant_total,
        acompte_verse: data.acompte_verse,
        solde_restant: data.montant_total - data.acompte_verse,
        produit: data.produits_finis,
        cree_le: data.created_at,
        mis_a_jour_le: data.updated_at,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
