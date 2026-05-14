import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../api/client';
import StatCard from '../../components/shared/StatCard';
import XAFPrice from '../../components/shared/XAFPrice';

const URGENCE_BADGE = {
  CRITIQUE: 'bg-red-100 text-red-700',
  URGENT:   'bg-orange-100 text-orange-700',
  NORMAL:   'bg-blue-100 text-blue-700',
};

export default function Approvisionnement() {
  const [suggestions, setSuggestions] = useState([]);
  const [commandes, setCommandes]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState('suggestions');

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    try {
      const [sugRes, cmdRes] = await Promise.all([
        api.get('/approvisionnement/suggestions'),
        api.get('/approvisionnement/commandes'),
      ]);
      // services return arrays directly; interceptor already unwraps r.data
      setSuggestions(Array.isArray(sugRes) ? sugRes : []);
      setCommandes(Array.isArray(cmdRes) ? cmdRes : []);
    } catch {
      toast.error('Erreur chargement approvisionnement');
    } finally { setLoading(false); }
  }

  async function creerBonCommande(suggestion) {
    if (!suggestion.fournisseur_id) {
      toast.error('Aucun fournisseur préférentiel pour ce produit');
      return;
    }
    try {
      await api.post('/approvisionnement/commande', {
        fournisseur_id: suggestion.fournisseur_id,
        lignes: [{
          produit_id: suggestion.id,
          quantite_commandee: suggestion.lot_min_commande || 1,
          prix_unitaire_xaf: suggestion.prix_achat_xaf || 0,
        }],
      });
      toast.success('Bon de commande créé');
      fetchData();
    } catch (e) { toast.error(e.message || 'Erreur création bon de commande'); }
  }

  const critique = suggestions.filter(s => s.urgence === 'CRITIQUE').length;
  const urgent   = suggestions.filter(s => s.urgence === 'URGENT').length;

  if (loading) return <div className="p-6 text-gray-500">Chargement…</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Approvisionnement</h1>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Suggestions" value={suggestions.length} icon="📦" />
        <StatCard label="Critiques" value={critique} icon="🔴" color="red" />
        <StatCard label="Urgents" value={urgent} icon="🟠" color="orange" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {[['suggestions', 'Suggestions réappro'], ['commandes', 'Bons de commande']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'suggestions' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Produit', 'Stock actuel', 'Stock min', 'Qté suggérée', 'Fournisseur', 'Coût estimé', 'Urgence', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {suggestions.map(s => (
                <tr key={s.produit_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{s.designation}</td>
                  <td className="px-4 py-3 text-gray-600">{s.stock_actuel}</td>
                  <td className="px-4 py-3 text-gray-600">{s.stock_minimum}</td>
                  <td className="px-4 py-3 font-semibold text-blue-700">{s.lot_min_commande || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{s.fournisseur_nom || '—'}</td>
                  <td className="px-4 py-3"><XAFPrice amount={(s.lot_min_commande || 0) * (s.prix_achat_xaf || 0)} /></td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${URGENCE_BADGE[s.urgence] || 'bg-gray-100 text-gray-600'}`}>
                      {s.urgence}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => creerBonCommande(s)}
                      className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                    >
                      Commander
                    </button>
                  </td>
                </tr>
              ))}
              {suggestions.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Aucune suggestion</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'commandes' && (
        <div className="space-y-3">
          {commandes.map(cmd => (
            <div key={cmd.id} className="bg-white border border-gray-200 rounded-lg p-4 flex justify-between items-center">
              <div>
                <p className="font-semibold text-gray-800">{cmd.reference}</p>
                <p className="text-sm text-gray-500">{cmd.fournisseur?.nom || cmd.fournisseur_id} · {new Date(cmd.created_at).toLocaleDateString('fr-CM')}</p>
              </div>
              <div className="text-right">
                <XAFPrice amount={cmd.montant_total_xaf} className="font-bold text-gray-800" />
                <span className={`block mt-1 text-xs px-2 py-0.5 rounded-full ${
                  cmd.statut === 'LIVRÉ' ? 'bg-green-100 text-green-700' :
                  cmd.statut === 'EN_ATTENTE' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{cmd.statut}</span>
              </div>
            </div>
          ))}
          {commandes.length === 0 && <p className="text-center text-gray-400 py-8">Aucune commande fournisseur</p>}
        </div>
      )}
    </div>
  );
}
