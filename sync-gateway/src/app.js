require('dotenv').config({ path: '../backend/.env' });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { requestLogger } = require('./middleware/logger');
const { errorHandler } = require('../backend/src/middleware/errorHandler');
const { initRealtimeListeners } = require('./services/realtimeService');
const syncRouter = require('./routes/sync');
const webhooksRouter = require('./routes/webhooks');

const app = express();

app.use(helmet());
app.use(cors({
  origin: [
    process.env.CORS_ORIGIN_LOVABLE || 'https://tafdil.lovable.app',
    'http://localhost:5173',
    'http://localhost:3001',
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));

app.use(requestLogger);

// Webhooks : raw body AVANT express.json (géré dans le router)
app.use('/webhooks', webhooksRouter);

app.use(express.json({ limit: '5mb' }));

app.get('/health', (_, res) =>
  res.json({ status: 'ok', service: 'TAFDIL Sync Gateway', ts: new Date().toISOString() })
);

app.use('/sync', syncRouter);

app.use(errorHandler);

const PORT = process.env.GATEWAY_PORT || 3001;
app.listen(PORT, () => {
  console.log(`Sync Gateway démarré sur le port ${PORT}`);
  initRealtimeListeners();
});

module.exports = app;
