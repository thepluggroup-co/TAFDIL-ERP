import { create } from 'zustand';
import { quincaillerieApi } from '@/api/quincaillerie';

export const useStockStore = create((set, get) => ({
  catalogue: [],
  conflits: [],
  loading: false,
  lastFetch: null,

  fetchCatalogue: async (params = {}) => {
    set({ loading: true });
    try {
      const data = await quincaillerieApi.getCatalogue(params);
      set({ catalogue: data.produits, loading: false, lastFetch: Date.now() });
    } catch {
      set({ loading: false });
    }
  },

  fetchConflits: async () => {
    try {
      const data = await quincaillerieApi.getStockConflits();
      set({ conflits: data.conflits });
    } catch {
      // Silently ignore auth errors before login
    }
  },

  // Stock dispo en cache local (évite les appels répétés)
  stockCache: {},
  getStockDispo: async (produitId) => {
    const cached = get().stockCache[produitId];
    if (cached && Date.now() - cached.ts < 30_000) return cached.value;

    const data = await quincaillerieApi.getStockDispo(produitId);
    set(s => ({
      stockCache: { ...s.stockCache, [produitId]: { value: data.stock, ts: Date.now() } }
    }));
    return data.stock;
  },

  invalidateCache: (produitId) =>
    set(s => {
      const { [produitId]: _, ...rest } = s.stockCache;
      return { stockCache: rest };
    }),
}));
