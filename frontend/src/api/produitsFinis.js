import api from './client';

const BASE = '/api/boutique-produits-finis';

export const produitsFiniApi = {
  // Catalogue
  getCatalogue: (params) => api.get(`${BASE}/catalogue`, { params }),

  // Production
  creerBonProduction: (payload) => api.post(`${BASE}/bon-production`, payload),
  validerBon: (id, payload) => api.put(`${BASE}/bon-production/${id}/valider`, payload),
  getStatsProduction: (params) => api.get(`${BASE}/stats/production`, { params }),
  getTracabilite: (id) => api.get(`${BASE}/tracabilite/${id}`),

  // Devis
  creerDevis: (payload) => api.post(`${BASE}/commande-sur-mesure`, payload),
  getDevis: (id, format) =>
    format === 'pdf'
      ? api.get(`${BASE}/devis/${id}`, { params: { format: 'pdf' }, responseType: 'blob' })
      : api.get(`${BASE}/devis/${id}`),
  accepterDevis: (id) => api.put(`${BASE}/devis/${id}/accepter`),

  // Commandes
  enregistrerAcompte: (commandeId, payload) =>
    api.post(`${BASE}/commande/${commandeId}/acompte`, payload),
  creerBonLivraison: (commandeId, payload) =>
    api.post(`${BASE}/commande/${commandeId}/bon-livraison`, payload),

  // Bon livraison
  getPdfBL: (id) =>
    api.get(`${BASE}/bon-livraison/${id}/pdf`, { responseType: 'blob' }),
  signerBL: (token, signature_base64) =>
    api.post(`${BASE}/bl/signer/${token}`, { signature_base64 }),
};
