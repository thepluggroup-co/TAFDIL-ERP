'use strict';

const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// Lecture corps brut pour validation HMAC
router.use(express.raw({ type: 'application/json' }));

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

function erpGateway() {
  return axios.create({
    baseURL: process.env.ERP_API_GATEWAY_URL,
    headers: { 'X-Api-Key': process.env.ERP_API_KEY, 'X-Source': 'ecommerce' },
  });
}

// POST /webhooks/notchpay — Paiement Mobile Money confirmé
router.post('/notchpay', async (req, res, next) => {
  try {
    // Validation HMAC
    const signature = req.headers['x-notchpay-signature'];
    const computed = crypto
      .createHmac('sha256', process.env.NOTCHPAY_HMAC_SECRET || '')
      .update(req.body)
      .digest('hex');

    if (signature !== computed) {
      return res.status(401).json({ success: false, message: 'Signature HMAC invalide' });
    }

    const payload = JSON.parse(req.body);
    const { reference, status, amount, transaction } = payload;

    if (status !== 'complete') {
      return res.json({ success: true, action: 'ignored', reason: `Statut ${status} ignoré` });
    }

    // Extrait commande_id depuis la référence (TAFDIL-{commande_id}-{ts})
    const commandeId = reference.split('-')[1];

    // Notifie l'ERP via sync-gateway
    await supabase().channel('paiements').send({
      type: 'broadcast',
      event: 'paiement_confirme',
      payload: { commande_id: commandeId, montant: amount, mode: transaction?.channel || 'MOBILE_MONEY', reference },
    });

    res.json({ success: true, commande_id: commandeId });
  } catch (err) { next(err); }
});

module.exports = router;
