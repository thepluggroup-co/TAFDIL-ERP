import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStockStore } from '@/stores/useStockStore';
import { quincaillerieApi } from '@/api/quincaillerie';
import StockBadge from '@/components/shared/StockBadge';
import StockConflitAlert from '@/components/quincaillerie/StockConflitAlert';
import XAFPrice from '@/components/shared/XAFPrice';
import {
  RefreshCw, AlertTriangle, TrendingUp, TrendingDown,
  X, BarChart2, Search,
} from 'lucide-react';
import dayjs from 'dayjs';

const CAT_DETAIL_OPTIONS = [
  'PROFILES_TUBES', 'TOLES_PLAQUES', 'SOUDURE',
  'PEINTURE_FINITION', 'VISSERIE', 'OUTILLAGE', 'EPI', 'DIVERS',
];

const MVT_COLOR = {
  ENTREE:     'bg-green-100 text-green-700',
  SORTIE:     'bg-red-100 text-red-700',
  AJUSTEMENT: 'bg-blue-100 text-blue-700',
  RETOUR:     'bg-purple-100 text-purple-700',
};

// ─── Panneau trafic entrée / sortie ──────────────────────────────────────────

function MouvementsPanel({ produit, onClose }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    quincaillerieApi
      .getMouvements(produit.id, typeFilter ? { type_mouvement: typeFilter } : {})
      .then(res => { setData(res); setLoading(false); })
      .catch(() => setLoading(false));
  }, [produit.id, typeFilter]);

  return (
    <motion.div
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0,  opacity: 1 }}
      exit={{    x: 40, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className="fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-40 flex flex-col border-l border-gray-200"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div>
          <h3 className="font-bold text-[#E30613] text-sm leading-tight">{produit.designation}</h3>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{produit.reference}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* KPIs entrées / sorties */}
      {data && (
        <div className="grid grid-cols-2 gap-3 px-5 py-3 bg-gray-50 border-b">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-green-500 shrink-0" />
            <div>
              <p className="text-xs text-gray-500">Entrées totales</p>
              <p className="text-sm font-bold text-green-700">+{data.totaux.entrees} {produit.unite}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TrendingDown size={16} className="text-red-500 shrink-0" />
            <div>
              <p className="text-xs text-gray-500">Sorties totales</p>
              <p className="text-sm font-bold text-red-700">−{data.totaux.sorties} {produit.unite}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filtre type */}
      <div className="flex gap-1.5 px-5 py-2.5 border-b flex-wrap">
        {['', 'ENTREE', 'SORTIE', 'AJUSTEMENT', 'RETOUR'].map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
              typeFilter === t
                ? 'bg-[#E30613] text-white border-[#E30613]'
                : 'text-gray-500 border-gray-200 hover:border-[#E30613]'
            }`}>
            {t || 'Tous'}
          </button>
        ))}
      </div>

      {/* Liste mouvements */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
        {loading ? (
          <p className="text-center text-gray-400 text-sm py-8">Chargement…</p>
        ) : !data?.mouvements?.length ? (
          <p className="text-center text-gray-400 text-sm py-8">Aucun mouvement enregistré</p>
        ) : (
          data.mouvements.map(m => (
            <div key={m.id} className="px-5 py-3 hover:bg-gray-50">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${MVT_COLOR[m.type_mouvement] || 'bg-gray-100 text-gray-600'}`}>
                  {m.type_mouvement}
                </span>
                <span className="text-xs text-gray-400">
                  {dayjs(m.created_at).format('DD/MM/YY HH:mm')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={`font-bold text-sm ${m.type_mouvement === 'ENTREE' ? 'text-green-700' : 'text-red-700'}`}>
                  {m.type_mouvement === 'ENTREE' ? '+' : '−'}{m.quantite} {produit.unite}
                </span>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {m.source_canal}
                </span>
              </div>
              {m.reference_doc && (
                <p className="text-xs text-gray-400 font-mono mt-0.5">{m.reference_doc}</p>
              )}
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}

// ─── StockView ────────────────────────────────────────────────────────────────

export default function StockView() {
  const { catalogue, conflits, loading, fetchCatalogue, fetchConflits } = useStockStore();
  const [showConflitsOnly, setShowConflitsOnly] = useState(false);
  const [selectedProduit,  setSelectedProduit]  = useState(null);

  // Filtres par colonne
  const [f, setF] = useState({ reference: '', designation: '', categorie_detail: '' });
  const setFilter = (col, val) => setF(prev => ({ ...prev, [col]: val }));

  useEffect(() => { fetchCatalogue(); fetchConflits(); }, []);

  const conflitIds = new Set(conflits.map(c => c.id));

  const filtered = catalogue.filter(p => {
    if (showConflitsOnly && !conflitIds.has(p.id)) return false;
    if (f.reference        && !p.reference?.toLowerCase().includes(f.reference.toLowerCase()))   return false;
    if (f.designation      && !p.designation?.toLowerCase().includes(f.designation.toLowerCase())) return false;
    if (f.categorie_detail && p.categorie_detail !== f.categorie_detail) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#E30613]">Stock Quincaillerie</h1>
        <button onClick={() => { fetchCatalogue(); fetchConflits(); }}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#E30613] border border-gray-200 rounded-lg px-3 py-1.5 transition-colors">
          <RefreshCw size={13} /> Actualiser
        </button>
      </div>

      <StockConflitAlert />

      <div className="flex items-center gap-2">
        <button onClick={() => setShowConflitsOnly(v => !v)}
          className={`px-3 py-1 text-xs rounded-full border flex items-center gap-1 transition-colors ${
            showConflitsOnly
              ? 'bg-amber-500 text-white border-amber-500'
              : 'text-amber-600 border-amber-300 hover:bg-amber-50'
          }`}>
          <AlertTriangle size={11} /> Conflits seulement
        </button>
        <span className="text-xs text-gray-400">
          {filtered.length} produit{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table avec filtres par sous-en-tête */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {/* Référence — filtre texte */}
              <th className="px-3 pt-2.5 pb-1.5 text-left w-28">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Référence</p>
                <div className="relative">
                  <Search size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-300" />
                  <input value={f.reference} onChange={e => setFilter('reference', e.target.value)}
                    placeholder="Filtrer…"
                    className="w-full pl-5 pr-1.5 py-0.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#E30613]" />
                </div>
              </th>

              {/* Désignation — filtre texte */}
              <th className="px-3 pt-2.5 pb-1.5 text-left">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Désignation</p>
                <div className="relative">
                  <Search size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-300" />
                  <input value={f.designation} onChange={e => setFilter('designation', e.target.value)}
                    placeholder="Filtrer…"
                    className="w-full pl-5 pr-1.5 py-0.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#E30613]" />
                </div>
              </th>

              {/* Catégorie — filtre select */}
              <th className="px-3 pt-2.5 pb-1.5 text-left w-36">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Catégorie</p>
                <select value={f.categorie_detail} onChange={e => setFilter('categorie_detail', e.target.value)}
                  className="w-full py-0.5 px-1 text-xs border border-gray-200 rounded focus:outline-none">
                  <option value="">Toutes</option>
                  {CAT_DETAIL_OPTIONS.map(c => (
                    <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </th>

              {['Stock réel', 'Réservé atelier', 'Dispo boutique', 'Prix public', 'Prix interne', 'Trafic'].map(h => (
                <th key={h} className="px-3 pt-2.5 pb-1.5 text-left">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</p>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">Chargement…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">Aucun produit</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id}
                className={`hover:bg-gray-50 transition-colors ${conflitIds.has(p.id) ? 'bg-amber-50/60' : ''}`}>
                <td className="px-3 py-2.5 text-xs text-gray-500 font-mono">{p.reference}</td>
                <td className="px-3 py-2.5 font-medium text-gray-800">{p.designation}</td>
                <td className="px-3 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${p.categorie_detail ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                    {(p.categorie_detail || p.categorie || '—').replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-2.5 tabular-nums">{p.stock_actuel} {p.unite}</td>
                <td className="px-3 py-2.5 tabular-nums text-amber-600 font-medium">
                  {p.quantite_reservee_atelier > 0 ? `−${p.quantite_reservee_atelier}` : '—'}
                </td>
                <td className="px-3 py-2.5">
                  <StockBadge dispo={p.stock_dispo_boutique} unite={p.unite} />
                </td>
                <td className="px-3 py-2.5"><XAFPrice amount={p.prix_public}  size="sm" /></td>
                <td className="px-3 py-2.5"><XAFPrice amount={p.prix_interne} size="sm" className="text-blue-600" /></td>
                <td className="px-3 py-2.5">
                  <button onClick={() => setSelectedProduit(p)}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#E30613] transition-colors"
                    title="Voir le trafic entrée/sortie">
                    <BarChart2 size={14} />
                    <span className="hidden xl:inline">Trafic</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Panneau latéral trafic */}
      <AnimatePresence>
        {selectedProduit && (
          <>
            <motion.div key="overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 z-30"
              onClick={() => setSelectedProduit(null)}
            />
            <MouvementsPanel
              key="panel"
              produit={selectedProduit}
              onClose={() => setSelectedProduit(null)}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
