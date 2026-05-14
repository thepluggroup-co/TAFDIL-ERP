import { useEffect, useState } from 'react';
import { useStockStore } from '@/stores/useStockStore';
import { useCartStore } from '@/stores/useCartStore';
import { supabase } from '@/lib/supabase';
import CaisseForm from '@/components/quincaillerie/CaisseForm';
import StockBadge from '@/components/shared/StockBadge';
import XAFPrice from '@/components/shared/XAFPrice';
import { Search } from 'lucide-react';

// Catégories quincaillerie selon le portefeuille TAFDIL
const CATEGORIES = [
  { key: '',                   label: 'Toutes' },
  { key: 'PROFILES_TUBES',     label: 'Profilés & Tubes' },
  { key: 'TOLES_PLAQUES',      label: 'Tôles & Plaques' },
  { key: 'SOUDURE',            label: 'Soudure & Consommables' },
  { key: 'PEINTURE_FINITION',  label: 'Peinture & Finition' },
  { key: 'VISSERIE',           label: 'Visserie & Fixation' },
  { key: 'OUTILLAGE',          label: 'Outillage' },
  { key: 'EPI',                label: 'Protection (EPI)' },
  { key: 'DIVERS',             label: 'Divers' },
];

export default function VenteComptoir() {
  const { catalogue, loading, fetchCatalogue } = useStockStore();
  const { addLigne } = useCartStore();

  const [search,    setSearch]    = useState('');
  const [categorie, setCategorie] = useState('');
  const [vendeurId, setVendeurId] = useState('');

  // Récupérer l'ID de l'utilisateur connecté (remplace le placeholder)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setVendeurId(user.id);
    });
  }, []);

  // Re-fetch lors du changement de catégorie
  useEffect(() => {
    fetchCatalogue(categorie ? { categorie_detail: categorie } : {});
  }, [categorie]);

  const filtered = catalogue.filter(p => {
    const q = search.toLowerCase();
    return (
      p.designation?.toLowerCase().includes(q) ||
      p.reference?.toLowerCase().includes(q)
    );
  });

  const refetch = () => fetchCatalogue(categorie ? { categorie_detail: categorie } : {});

  return (
    <div className="flex gap-5 h-full">

      {/* ── Catalogue ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">

        {/* Titre + recherche */}
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-[#1a3a5c] shrink-0">Vente comptoir</h1>
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un produit…"
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#1a3a5c] outline-none"
            />
          </div>
        </div>

        {/* Filtres catégorie TAFDIL */}
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map(c => (
            <button
              key={c.key}
              onClick={() => setCategorie(c.key)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                categorie === c.key
                  ? 'bg-[#1a3a5c] text-white border-[#1a3a5c]'
                  : 'text-gray-600 border-gray-200 hover:border-[#1a3a5c] hover:text-[#1a3a5c]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Grille produits */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Chargement…
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto grid grid-cols-2 xl:grid-cols-3 gap-3 content-start">
            {filtered.map(p => (
              <button
                key={p.id}
                onClick={() => addLigne(p)}
                className="text-left bg-white border border-gray-200 rounded-xl p-3 hover:border-[#e8740c] hover:shadow-sm transition-all group"
              >
                <p className="text-sm font-medium text-gray-800 leading-tight mb-0.5 group-hover:text-[#1a3a5c] line-clamp-2">
                  {p.designation}
                </p>
                <p className="text-xs text-gray-400 mb-1 font-mono">{p.reference}</p>
                {p.categorie_detail && (
                  <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full inline-block mb-1.5">
                    {p.categorie_detail.replace(/_/g, ' ')}
                  </span>
                )}
                <div className="flex items-end justify-between">
                  <XAFPrice amount={p.prix_public} size="sm" className="text-[#e8740c]" />
                  <StockBadge dispo={p.stock_dispo_boutique} unite={p.unite} />
                </div>
              </button>
            ))}
            {!filtered.length && (
              <p className="col-span-3 text-center text-gray-400 text-sm py-10">
                Aucun produit trouvé
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Caisse ─────────────────────────────────────────── */}
      <div className="w-80 bg-white border border-gray-200 rounded-xl p-4 flex flex-col shrink-0 shadow-sm">
        <h2 className="font-bold text-[#1a3a5c] text-sm mb-3 pb-2 border-b border-gray-100">
          Panier
        </h2>
        <CaisseForm vendeurId={vendeurId} onSuccess={refetch} />
      </div>
    </div>
  );
}
