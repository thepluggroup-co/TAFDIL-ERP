'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const allRoutes = require('./routes/index');
const extRoutes = require('./routes/ext');
const syncGatewayRoutes = require('./routes/sync-gateway');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// ── Sécurité & compression ────────────────────────────────────────────────────

app.use(helmet());
app.use(compression());

const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    cb(new Error('CORS non autorisé'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key', 'X-Source'],
}));

// ── Parsing & logs ────────────────────────────────────────────────────────────

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('combined'));

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'TAFDIL ERP API Gateway',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ── Routes externes (API key — e-commerce backend) ────────────────────────────
// IMPORTANT: monté AVANT /api pour éviter que requireAuth intercepte /api/ext
app.use('/api/ext', extRoutes);

// ── Routes ERP (JWT requis) ───────────────────────────────────────────────────
app.use('/api', allRoutes);

// ── Routes sync gateway (offline ERP natif) ───────────────────────────────────
app.use('/sync', syncGatewayRoutes);

// ── Webhooks (publics, HMAC vérifiés dans les handlers) ───────────────────────
app.use('/webhooks', require('./routes/webhooks'));

// ── 404 ───────────────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route introuvable : ${req.method} ${req.path}`,
  });
});

// ── Erreurs globales ──────────────────────────────────────────────────────────

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[ERP API Gateway] Port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

module.exports = app;
