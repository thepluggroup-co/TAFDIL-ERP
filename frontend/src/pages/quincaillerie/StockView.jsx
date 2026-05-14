import { useEffect, useState } from 'react';
import { useStockStore } from '@/stores/useStockStore';
import StockBadge from '@/components/shared/StockBadge';
import StockConflitAlert from '@/components/quincaillerie/StockConflitAlert';
import XAFPrice from '@/components/shared/XAFPrice';
import { RefreshCw, AlertTriangle } from 'lucide-react';

const CATEGORIES = ['Tous', 'QUINCAILLERIE', 'PRODUIT_FINI', 'MATIERE_PREMIERE'];

export default function StockView() {
  const { catalogue, conflits, loading, fetchCatalogue, fetchConflits } = useStockStore();
  const [categorie, setCategorie] = useState('Tous');
  const [showConflitsOnly, setShowConflitsOnly] = useState(false);

  useEffect(() => { fetchCatalogue(); fetchConflits(); }, []);

  const conflitIds = new Set(conflits.map(c => c.id));

  const filtered = catalogue.filter(p => {
    if (categorie !== 'Tous' && p.categorie !== categorie) return false;
    if (showConflitsOnly && !conflitIds.has(p.id)) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#1a3a5c]">Stock Quincaillerie</h1>
        <button onClick={() => { fetchCatalogue(); fetchConflits(); }}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#1a3a5c] border rounded-lg px-3 py-1.5 transition-colors">
          <RefreshCw size={13} /> Actualiser
        </button>
      </div>

      <StockConflitAlert />

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setCategorie(c)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              categorie === c
                ? 'bg-[#1a3a5c] text-white border-[#1a3a5c]'
                : 'text-gray-600 border-gray-300 hover:border-[#1a3a5c]'
            }`}>
            {c}
          </button>
        ))}
        <button onClick={() => setShowConflitsOnly(v => !v)}
          className={`px-3 py-1 text-xs rounded-full border flex items-center gap-1 transition-colors ${
            showConflitsOnly
              ? 'bg-amber-500 text-white border-amber-500'
              : 'text-amber-600 border-amber-300 hover:bg-amber-50'
          }`}>
          <AlertTriangle size={11} /> Conflits seulement
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Référence', 'Désignation', 'Catégorie', 'Stock réel', 'Réservé atelier', 'Dispo boutique', 'Prix public', 'Prix interne'].map(h => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Chargement…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Aucun produit</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id} className={`hover:bg-gray-50 ${conflitIds.has(p.id) ? 'bg-amber-50/50' : ''}`}>
                <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">{p.reference}</td>
                <td className="px-4 py-2.5 font-medium text-gray-800">{p.designation}</td>
                <td className="px-4 py-2.5">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{p.categorie}</span>
                </td>
                <td className="px-4 py-2.5 tabular-nums">{p.stock_actuel} {p.unite}</td>
                <td className="px-4 py-2.5 tabular-nums text-amber-600 font-medium">
                  {p.quantite_reservee_atelier > 0 ? `−${p.quantite_reservee_atelier}` : '—'}
                </td>
                <td className="px-4 py-2.5">
                  <StockBadge dispo={p.stock_dispo_boutique} unite={p.unite} />
                </td>
                <td className="px-4 py-2.5"><XAFPrice amount={p.prix_public} size="sm" /></td>
                <td className="px-4 py-2.5"><XAFPrice amount={p.prix_interne} size="sm" className="text-blue-600" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
