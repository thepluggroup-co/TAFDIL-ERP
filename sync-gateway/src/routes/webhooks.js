const express = require('express');
const crypto = require('crypto');
const supabase = require('../../backend/src/config/supabase');
const { rateLimit } = require('../middleware/rateLimiter');

const router = express.Router();

// ── Utilitaire HMAC ─────────────────────────────────────────
function verifierSignatureHMAC(payload, signatureHeader, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Middleware raw body pour HMAC (doit être avant express.json)
function rawBody(req, res, next) {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', chunk => { data += chunk; });
  req.on('end', () => { req.rawBody = data; next(); });
}

// ── POST /webhooks/paiement-mobile-money ────────────────────
// Reçoit les confirmations NotchPay
router.post(
  '/paiement-mobile-money',
  rawBody,
  rateLimit(10),
  async (req, res) => {
    const sig = req.headers['x-notchpay-signature'] || '';
    const secret = process.env.NOTCHPAY_WEBHOOK_SECRET || '';

    if (!verifierSignatureHMAC(req.rawBody, sig, secret)) {
      return res.status(401).json({ message: 'Signature HMAC invalide' });
    }

    let payload;
    try { payload = JSON.parse(req.rawBody); }
    catch { return res.status(400).json({ message: 'Payload JSON invalide' }); }

    const { reference, status, amount, currency, customer } = payload;
    if (status !== 'complete') {
      return res.json({ received: true, action: 'ignored', status });
    }

    // Trouver la commande par référence de paiement
    const { data: acompte } = await supabase
      .from('acomptes')
      .select('id, commande_id')
      .eq('reference_paiement', reference)
      .maybeSingle();

    if (acompte) {
      // Marquer statut paiement
      await supabase.from('acomptes')
        .update({ notes: `NotchPay confirmé — ${new Date().toISOString()}` })
        .eq('id', acompte.id);
    }

    // Diffuser via Realtime
    await supabase.channel('paiements').send({
      type: 'broadcast',
      event: 'paiement_confirme',
      payload: { reference, amount, currency, commande_id: acompte?.commande_id },
    });

    res.json({ received: true, action: 'processed' });
  }
);

// ── POST /webhooks/commande-enligne ─────────────────────────
// Reçoit les nouvelles commandes depuis le site e-commerce Lovable
router.post(
  '/commande-enligne',
  rawBody,
  rateLimit(20),
  async (req, res) => {
    const sig = req.headers['x-tafdil-signature'] || '';
    const secret = process.env.ECOMMERCE_WEBHOOK_SECRET || '';

    if (!verifierSignatureHMAC(req.rawBody, sig, secret)) {
      return res.status(401).json({ message: 'Signature invalide' });
    }

    let payload;
    try { payload = JSON.parse(req.rawBody); }
    catch { return res.status(400).json({ message: 'JSON invalide' }); }

    const { client, produit_fini_id, type_produit, specifications, source } = payload;

    // Créer le devis automatiquement via service existant
    const devisService = require('../../backend/src/services/devisService');
    const devis = await devisService.creerDevis({
      client_nom: client?.nom,
      client_telephone: client?.telephone,
      client_email: client?.email,
      type_produit: type_produit || 'AUTRE',
      produit_fini_id: produit_fini_id || null,
      specifications: specifications || {},
      notes_internes: `Commande en ligne — source: ${source || 'site web'}`,
    });

    // Alerte DG via Realtime
    await supabase.channel('commandes-live').send({
      type: 'broadcast',
      event: 'nouvelle_commande_enligne',
      payload: { devis_id: devis.devis_id, numero: devis.numero, client: client?.nom },
    });

    res.status(201).json({ received: true, devis_id: devis.devis_id, numero: devis.numero });
  }
);

module.exports = router;
