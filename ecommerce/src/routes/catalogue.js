'use strict';

const express = require('express');
const axios = require('axios');

const router = express.Router();

const erpGateway = () => axios.create({
  baseURL: process.env.ERP_API_GATEWAY_URL,
  headers: { 'X-Api-Key': process.env.ERP_API_KEY, 'X-Source': 'ecommerce' },
  timeout: 8000,
});

// GET /api/ecommerce/catalogue — Catalogue produits finis disponibles
router.get('/', async (req, res, next) => {
  try {
    const { data } = await erpGateway().get('/api/ext/catalogue');
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/ecommerce/catalogue/stock/:id — Stock d'un produit
router.get('/stock/:id', async (req, res, next) => {
  try {
    const { data } = await erpGateway().get(`/api/ext/stock/${req.params.id}`);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
