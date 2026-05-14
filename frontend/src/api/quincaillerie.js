import api from './client';

const BASE = '/api/boutique-quincaillerie';

export const quincaillerieApi = {
  // Catalogue
  getCatalogue: (params) => api.get(`${BASE}/catalogue-public`, { params }),

  // Stock
  getStockDispo: (id) => api.get(`${BASE}/stock-dispo/${id}`),
  getStockConflits: () => api.get(`${BASE}/stock-conflits`),
  getMouvements: (id, params) => api.get(`${BASE}/mouvements/${id}`, { params }),

  // Vente
  creerVente: (payload) => api.post(`${BASE}/vente-comptoir`, payload),
  genererTicket: (vente_id) => api.post(`${BASE}/caisse/ticket`, { vente_id },
    { responseType: 'blob' }),

  // Stats
  getStatsJour: (date) => api.get(`${BASE}/stats/jour`, { params: { date } }),

  // Offline sync
  syncOffline: (ventes) => api.post('/api/boutique/sync-offline', { ventes }),
};
