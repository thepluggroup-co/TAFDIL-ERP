import { useEffect, useState } from 'react';
import { useStockStore } from '@/stores/useStockStore';
import { useCartStore } from '@/stores/useCartStore';
import CaisseForm from '@/components/quincaillerie/CaisseForm';
import StockBadge from '@/components/shared/StockBadge';
import XAFPrice from '@/components/shared/XAFPrice';
import { Search } from 'lucide-react';

const VENDEUR_ID = 'replace-with-auth-user-id'; // TODO: inject from Supabase auth context

export default function VenteComptoir() {
  const { catalogue, loading, fetchCatalogue } = useStockStore();
  const { addLigne, clientType } = useCartStore();
  const [search, setSearch] = useState('');

  useEffect(() => { fetchCatalogue(); }, []);

  const filtered = catalogue.filter(p =>
    p.designation.toLowerCase().includes(search.toLowerCase()) ||
    p.reference.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex gap-5 h-full">
      {/* Catalogue produits */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-[#1a3a5c] shrink-0">Vente comptoir</h1>
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un produit…"
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#1a3a5c] outline-none" />
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Chargement…</div>
        ) : (
          <div className="flex-1 overflow-y-auto grid grid-cols-2 xl:grid-cols-3 gap-3 content-start">
            {filtered.map(p => {
              const prix = clientType === 'INTERNE' ? p.prix_interne : p.prix_public;
              return (
                <button key={p.id}
                  onClick={() => addLigne(p)}
                  className="text-left bg-white border border-gray-200 rounded-xl p-3 hover:border-[#e8740c] hover:shadow-sm transition-all group">
                  <p className="text-sm font-medium text-gray-800 leading-tight mb-1 group-hover:text-[#1a3a5c]">
                    {p.designation}
                  </p>
                  <p className="text-xs text-gray-400 mb-2">{p.reference}</p>
                  <div className="flex items-end justify-between">
                    <XAFPrice amount={prix} size="sm" className="text-[#e8740c]" />
                    <StockBadge dispo={p.stock_dispo_boutique} unite={p.unite} />
                  </div>
                </button>
              );
            })}
            {!filtered.length && (
              <p className="col-span-3 text-center text-gray-400 text-sm py-10">Aucun produit trouvé</p>
            )}
          </div>
        )}
      </div>

      {/* Caisse */}
      <div className="w-80 bg-white border border-gray-200 rounded-xl p-4 flex flex-col shrink-0 shadow-sm">
        <h2 className="font-bold text-[#1a3a5c] text-sm mb-3 pb-2 border-b">Panier</h2>
        <CaisseForm vendeurId={VENDEUR_ID} onSuccess={() => fetchCatalogue()} />
      </div>
    </div>
  );
}
