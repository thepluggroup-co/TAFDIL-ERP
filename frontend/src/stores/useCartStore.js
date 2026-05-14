import { create } from 'zustand';

export const useCartStore = create((set, get) => ({
  lignes: [],        // [{ produit_id, reference, designation, quantite, prix_unitaire, remise_pct }]
  clientType: 'PUBLIC',
  clientNom: '',
  modePaiement: 'ESPECES',

  setClientType: (t) => set({ clientType: t }),
  setClientNom: (n) => set({ clientNom: n }),
  setModePaiement: (m) => set({ modePaiement: m }),

  addLigne: (produit) => {
    const { lignes, clientType } = get();
    const existing = lignes.find(l => l.produit_id === produit.id);
    const prix = clientType === 'INTERNE' ? produit.prix_interne : produit.prix_public;

    if (existing) {
      set({ lignes: lignes.map(l =>
        l.produit_id === produit.id
          ? { ...l, quantite: l.quantite + 1 }
          : l
      )});
    } else {
      set({ lignes: [...lignes, {
        produit_id: produit.id,
        reference: produit.reference,
        designation: produit.designation,
        quantite: 1,
        prix_unitaire: prix,
        remise_pct: 0,
      }]});
    }
  },

  updateQte: (produit_id, quantite) =>
    set(s => ({ lignes: s.lignes.map(l => l.produit_id === produit_id ? { ...l, quantite } : l) })),

  removeLigne: (produit_id) =>
    set(s => ({ lignes: s.lignes.filter(l => l.produit_id !== produit_id) })),

  clearCart: () => set({ lignes: [], clientNom: '', modePaiement: 'ESPECES' }),

  get totaux() {
    const lignes = get().lignes;
    const ht = lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire * (1 - l.remise_pct / 100), 0);
    const tva = ht * 0.1925;
    return {
      montant_ht: Math.round(ht),
      montant_tva: Math.round(tva),
      montant_total: Math.round(ht + tva),
    };
  },
}));
