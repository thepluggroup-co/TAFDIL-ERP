import { useEffect, useState } from 'react';
import { produitsFiniApi } from '@/api/produitsFinis';
import DevisForm from '@/components/produits-finis/DevisForm';
import XAFPrice from '@/components/shared/XAFPrice';
import { Ruler, X } from 'lucide-react';

const TYPES = ['Tous', 'PORTAIL', 'PORTE', 'BALCON', 'GARDE_CORPS', 'CLAUSTRA', 'AUTRE'];

export default function Catalogue() {
  const [produits, setProduits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('Tous');
  const [selected, setSelected] = useState(null);
  const [showDevis, setShowDevis] = useState(false);

  const fetchCatalogue = async () => {
    setLoading(true);
    try {
      const params = typeFilter !== 'Tous' ? { type: typeFilter } : {};
      const res = await produitsFiniApi.getCatalogue(params);
      setProduits(res.produits);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCatalogue(); }, [typeFilter]);

  const dimStr = (d) => {
    if (!d) return null;
    return [d.largeur, d.hauteur].filter(Boolean).map(v => `${v}mm`).join(' × ');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#1a3a5c]">Catalogue Produits Finis</h1>
      </div>

      {/* Filtres type */}
      <div className="flex gap-2 flex-wrap">
        {TYPES.map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              typeFilter === t
                ? 'bg-[#1a3a5c] text-white border-[#1a3a5c]'
                : 'text-gray-600 border-gray-300 hover:border-[#1a3a5c]'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Grille produits */}
      {loading ? (
        <p className="text-center py-12 text-gray-400">Chargement…</p>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
          {produits.map(p => (
            <div key={p.id} onClick={() => setSelected(p)}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md hover:border-[#e8740c] transition-all cursor-pointer group">
              {p.photos_urls?.[0] ? (
                <img src={p.photos_urls[0]} alt={p.designation}
                  className="w-full h-40 object-cover" />
              ) : (
                <div className="w-full h-40 bg-gradient-to-br from-[#1a3a5c]/10 to-[#e8740c]/10 flex items-center justify-center">
                  <span className="text-3xl text-[#1a3a5c]/30">{p.type?.[0]}</span>
                </div>
              )}
              <div className="p-3">
                <p className="font-semibold text-gray-800 text-sm group-hover:text-[#1a3a5c] leading-snug">{p.designation}</p>
                <p className="text-xs text-gray-400 mt-0.5">{p.reference}</p>
                {dimStr(p.dimensions) && (
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                    <Ruler size={10} /> {dimStr(p.dimensions)}
                  </p>
                )}
                <div className="flex items-center justify-between mt-2">
                  <XAFPrice amount={p.prix_vente} size="md" className="text-[#e8740c]" />
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    Disponible
                  </span>
                </div>
              </div>
            </div>
          ))}
          {!produits.length && (
            <p className="col-span-3 text-center py-12 text-gray-400">Aucun produit disponible</p>
          )}
        </div>
      )}

      {/* Panneau devis */}
      {showDevis && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-bold text-[#1a3a5c]">Commande sur mesure</h2>
              <button onClick={() => setShowDevis(false)}><X size={18} className="text-gray-500" /></button>
            </div>
            <div className="p-5 overflow-y-auto max-h-[75vh]">
              <DevisForm onSuccess={() => setShowDevis(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
