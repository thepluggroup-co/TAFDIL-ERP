'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { TafdilClient } = require('@tafdil/sdk');

const app = express();

// ── Sécurité & CORS ───────────────────────────────────────────────────────────

const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim());

app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS non autorisé'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('combined'));

// ── SDK Tafdil — abonnements Realtime ────────────────────────────────────────

let sdkClient = null;

async function initSdk() {
  sdkClient = new TafdilClient({
    supabaseUrl:     process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    apiGatewayUrl:   process.env.ERP_API_GATEWAY_URL,
    jwtToken:        process.env.ERP_API_KEY,
  });
  await sdkClient.connect();

  // Écoute catalogue ERP → diffuse via SSE aux clients Lovable
  sdkClient.onCatalogueUpdate(payload => {
    app.locals.catalogueListeners?.forEach(res => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    });
  });

  // Écoute paiements confirmés
  sdkClient.onPaymentConfirmed(payload => {
    app.locals.paymentListeners?.forEach(({ commandeId, res }) => {
      if (payload.commande_id === commandeId) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    });
  });

  console.log('[SDK] Connecté aux channels Realtime ERP');
}

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/health', (_, res) => {
  res.json({
    status: 'ok',
    service: 'TAFDIL E-commerce Backend',
    sdk_connected: sdkClient?._supabase !== null,
    timestamp: new Date().toISOString(),
  });
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/api/ecommerce/catalogue', require('./routes/catalogue'));
app.use('/api/ecommerce',           require('./routes/commandes'));
app.use('/api/ecommerce',           require('./routes/paiements'));
app.use('/webhooks',                require('./routes/webhooks'));

// ── SSE — Catalogue temps réel (consommé par Lovable frontend) ────────────────
app.get('/api/ecommerce/catalogue/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (!app.locals.catalogueListeners) app.locals.catalogueListeners = [];
  app.locals.catalogueListeners.push(res);

  req.on('close', () => {
    app.locals.catalogueListeners = app.locals.catalogueListeners.filter(r => r !== res);
  });
});

// ── 404 & Erreurs ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route introuvable : ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ success: false, message: err.message });
});

// ── Démarrage ─────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3002;

initSdk().then(() => {
  app.listen(PORT, () => {
    console.log(`[E-commerce Backend] Port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
}).catch(err => {
  console.error('[SDK] Échec connexion:', err.message);
  process.exit(1);
});

module.exports = app;
