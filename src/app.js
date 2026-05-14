require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const boutiqueRouter = require('./routes/boutique-quincaillerie');
const produitsFiniRouter = require('./routes/boutique-produits-finis');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// ---- Sécurité & compression ----
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));

// ---- Parsing ----
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ---- Logs ----
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// ---- Health check ----
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'TAFDIL ERP', timestamp: new Date().toISOString() });
});

// ---- Routes métier ----
app.use('/api/boutique-quincaillerie', boutiqueRouter);
app.use('/api/boutique-produits-finis', produitsFiniRouter);

// Alias sync-offline (spécification demandée : /api/boutique/sync-offline)
app.use('/api/boutique', boutiqueRouter);

// ---- 404 ----
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route introuvable : ${req.method} ${req.path}` });
});

// ---- Gestion erreurs globale ----
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`TAFDIL ERP démarré sur le port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

module.exports = app;
