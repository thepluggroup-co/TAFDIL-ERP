'use strict';

const express = require('express');
const crypto = require('crypto');
const supabase = require('../config/supabase');

const router = express.Router();

// Corps brut pour validation HMAC
router.use(express.raw({ type: 'application/json' }));

// POST /webhooks/notchpay — Paiement Mobile Money confirmé
router.post('/notchpay', async (req, res, next) => {
  try {
    const signature = req.headers['x-notchpay-signature'];
    const computed = crypto
      .createHmac('sha256', process.env.NOTCHPAY_HMAC_SECRET || '')
      .update(req.body)
      .digest('hex');

    if (signature !== computed) {
      return res.status(401).json({ message: 'Signature invalide' });
    }

    const { reference, status, amount, transaction } = JSON.parse(req.body);
    if (status !== 'complete') return res.json({ action: 'ignored' });

    const commandeId = reference.split('-')[1];

    // Met à jour l'acompte versé
    await supabase
      .from('commandes_produits_finis')
      .update({ acompte_verse: amount, statut: 'PAYÉE' })
      .eq('id', commandeId);

    // Broadcast Realtime → ERP notifie DG + e-commerce confirme au client
    await supabase.channel('paiements').send({
      type: 'broadcast',
      event: 'paiement_confirme',
      payload: {
        commande_id: commandeId,
        montant: amount,
        mode: transaction?.channel || 'MOBILE_MONEY',
        reference,
      },
    });

    res.json({ success: true, commande_id: commandeId });
  } catch (err) { next(err); }
});

// POST /webhooks/ecommerce-order — Commande créée côté Lovable (backup)
router.post('/ecommerce-order', async (req, res, next) => {
  try {
    const body = typeof req.body === 'string' || Buffer.isBuffer(req.body)
      ? JSON.parse(req.body)
      : req.body;

    await supabase.channel('commandes-live').send({
      type: 'broadcast',
      event: 'nouvelle_commande_enligne',
      payload: body,
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
