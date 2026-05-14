'use strict';

const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

const erpGateway = () => axios.create({
  baseURL: process.env.ERP_API_GATEWAY_URL,
  headers: { 'X-Api-Key': process.env.ERP_API_KEY, 'X-Source': 'ecommerce' },
  timeout: 10000,
});

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

// POST /api/ecommerce/commande — Nouvelle commande client
router.post('/commande', async (req, res, next) => {
  try {
    const {
      client_nom, client_telephone, client_email,
      produit_fini_id, montant_total, notes,
    } = req.body;

    if (!client_nom || !produit_fini_id || !montant_total) {
      return res.status(400).json({
        success: false,
        message: 'client_nom, produit_fini_id et montant_total requis',
      });
    }

    // Vérifie disponibilité via ERP
    const stockRes = await erpGateway().get(`/api/ext/stock/${produit_fini_id}`).catch(() => null);
    if (stockRes?.data?.alerte_rupture) {
      return res.status(409).json({ success: false, message: 'Produit non disponible' });
    }

    // Transmet à l'ERP
    const { data } = await erpGateway().post('/api/ext/commande-enligne', {
      client_nom, client_telephone, client_email,
      produit_fini_id, montant_total, notes,
    });

    res.status(201).json(data);
  } catch (err) { next(err); }
});

// POST /api/ecommerce/devis-sur-mesure — Configurateur
router.post('/devis-sur-mesure', async (req, res, next) => {
  try {
    const { data } = await erpGateway().post('/api/ext/devis-demande', req.body);
    res.status(201).json(data);
  } catch (err) { next(err); }
});

// GET /api/ecommerce/commande/:id/statut — Tracking commande
router.get('/commande/:id/statut', async (req, res, next) => {
  try {
    const { data } = await erpGateway().get(`/api/ext/commande/${req.params.id}`);
    res.json(data);
  } catch (err) { next(err); }
});

module.exports = router;
