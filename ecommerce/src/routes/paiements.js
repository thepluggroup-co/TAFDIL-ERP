'use strict';

const express = require('express');
const axios = require('axios');

const router = express.Router();

const NOTCHPAY_BASE = 'https://api.notchpay.co';

// POST /api/ecommerce/initier-paiement — Initie paiement NotchPay
router.post('/initier-paiement', async (req, res, next) => {
  try {
    const { commande_id, montant, client_email, client_nom, description } = req.body;

    if (!commande_id || !montant || !client_email) {
      return res.status(400).json({ success: false, message: 'commande_id, montant et client_email requis' });
    }

    const { data } = await axios.post(`${NOTCHPAY_BASE}/payments/initialize`, {
      amount: montant,
      currency: 'XAF',
      email: client_email,
      name: client_nom,
      description: description || `Commande TAFDIL ${commande_id}`,
      reference: `TAFDIL-${commande_id}-${Date.now()}`,
      callback: `${process.env.CALLBACK_URL || 'https://tafdil.cm'}/commande/${commande_id}/confirmation`,
    }, {
      headers: {
        Authorization: process.env.NOTCHPAY_PUBLIC_KEY,
        'Content-Type': 'application/json',
      },
    });

    res.json({
      success: true,
      payment_url: data.authorization_url,
      reference: data.transaction?.reference,
    });
  } catch (err) {
    next(Object.assign(err, { status: err.response?.status }));
  }
});

module.exports = router;
